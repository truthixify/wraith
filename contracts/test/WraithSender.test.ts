import { expect } from "chai";
import { ethers } from "hardhat";
import { ERC5564Announcer, WraithSender } from "../typechain-types";

describe("WraithSender", function () {
  let announcer: ERC5564Announcer;
  let sender: WraithSender;
  const schemeId = 1;
  const ephemeralPubKey = "0x" + "ab".repeat(33);
  const metadata = "0xff" + "00".repeat(10);

  beforeEach(async function () {
    const AnnouncerFactory = await ethers.getContractFactory("ERC5564Announcer");
    announcer = await AnnouncerFactory.deploy();
    await announcer.waitForDeployment();

    const SenderFactory = await ethers.getContractFactory("WraithSender");
    sender = await SenderFactory.deploy(await announcer.getAddress());
    await sender.waitForDeployment();
  });

  describe("sendETH", function () {
    it("should transfer ETH and emit Announcement atomically", async function () {
      const [, recipient] = await ethers.getSigners();
      const stealthAddress = recipient.address;
      const amount = ethers.parseEther("1.0");

      const balanceBefore = await ethers.provider.getBalance(stealthAddress);

      await expect(
        sender.sendETH(schemeId, stealthAddress, ephemeralPubKey, metadata, {
          value: amount,
        })
      )
        .to.emit(announcer, "Announcement")
        .withArgs(
          schemeId,
          stealthAddress,
          await sender.getAddress(),
          ephemeralPubKey,
          metadata
        );

      const balanceAfter = await ethers.provider.getBalance(stealthAddress);
      expect(balanceAfter - balanceBefore).to.equal(amount);
    });
  });

  describe("sendERC20", function () {
    it("should transfer tokens and emit Announcement atomically", async function () {
      const [deployer, recipient] = await ethers.getSigners();
      const stealthAddress = recipient.address;

      const TokenFactory = await ethers.getContractFactory("ERC20Mock");
      let token;
      try {
        token = await TokenFactory.deploy();
      } catch {
        // ERC20Mock not available, deploy a minimal one inline
        const MinimalToken = await ethers.getContractFactory(
          "contracts/test/ERC20Mock.sol:ERC20Mock"
        );
        token = await MinimalToken.deploy();
      }
      await token.waitForDeployment();
      const tokenAddress = await token.getAddress();
      const senderAddress = await sender.getAddress();

      const amount = ethers.parseEther("100");
      await token.mint(deployer.address, amount);
      await token.approve(senderAddress, amount);

      await expect(
        sender.sendERC20(
          tokenAddress,
          amount,
          schemeId,
          stealthAddress,
          ephemeralPubKey,
          metadata
        )
      ).to.emit(announcer, "Announcement");

      expect(await token.balanceOf(stealthAddress)).to.equal(amount);
    });
  });

  describe("batchSendETH", function () {
    it("should send ETH to multiple stealth addresses and announce each", async function () {
      const signers = await ethers.getSigners();
      const stealthAddresses = [signers[1].address, signers[2].address, signers[3].address];
      const amounts = [
        ethers.parseEther("1.0"),
        ethers.parseEther("2.0"),
        ethers.parseEther("0.5"),
      ];
      const totalValue = amounts.reduce((a, b) => a + b, 0n);
      const ephPubKeys = [ephemeralPubKey, ephemeralPubKey, ephemeralPubKey];
      const metas = [metadata, metadata, metadata];

      const balancesBefore = await Promise.all(
        stealthAddresses.map((a) => ethers.provider.getBalance(a))
      );

      const tx = await sender.batchSendETH(
        schemeId,
        stealthAddresses,
        ephPubKeys,
        metas,
        amounts,
        { value: totalValue }
      );
      const receipt = await tx.wait();

      // Should emit 3 Announcement events
      const announcerInterface = announcer.interface;
      const announcementLogs = receipt!.logs.filter((log) => {
        try {
          announcerInterface.parseLog({ topics: log.topics as string[], data: log.data });
          return true;
        } catch {
          return false;
        }
      });
      expect(announcementLogs.length).to.equal(3);

      // Check balances
      for (let i = 0; i < stealthAddresses.length; i++) {
        const balanceAfter = await ethers.provider.getBalance(stealthAddresses[i]);
        expect(balanceAfter - balancesBefore[i]).to.equal(amounts[i]);
      }
    });

    it("should revert if msg.value does not match sum of amounts", async function () {
      const [, r1] = await ethers.getSigners();

      await expect(
        sender.batchSendETH(
          schemeId,
          [r1.address],
          [ephemeralPubKey],
          [metadata],
          [ethers.parseEther("1.0")],
          { value: ethers.parseEther("0.5") }
        )
      ).to.be.reverted;
    });

    it("should revert on array length mismatch", async function () {
      const [, r1, r2] = await ethers.getSigners();

      await expect(
        sender.batchSendETH(
          schemeId,
          [r1.address, r2.address],
          [ephemeralPubKey], // only 1, should be 2
          [metadata, metadata],
          [ethers.parseEther("1.0"), ethers.parseEther("1.0")],
          { value: ethers.parseEther("2.0") }
        )
      ).to.be.revertedWithCustomError(sender, "LengthMismatch");
    });
  });

  describe("batchSendERC20", function () {
    it("should send tokens to multiple stealth addresses and announce each", async function () {
      const signers = await ethers.getSigners();
      const deployer = signers[0];
      const stealthAddresses = [signers[1].address, signers[2].address];
      const amounts = [ethers.parseEther("50"), ethers.parseEther("100")];

      const TokenFactory = await ethers.getContractFactory(
        "contracts/test/ERC20Mock.sol:ERC20Mock"
      );
      const token = await TokenFactory.deploy();
      await token.waitForDeployment();
      const tokenAddress = await token.getAddress();
      const senderAddress = await sender.getAddress();

      const totalAmount = amounts.reduce((a, b) => a + b, 0n);
      await token.mint(deployer.address, totalAmount);
      await token.approve(senderAddress, totalAmount);

      const tx = await sender.batchSendERC20(
        tokenAddress,
        schemeId,
        stealthAddresses,
        [ephemeralPubKey, ephemeralPubKey],
        [metadata, metadata],
        amounts
      );
      const receipt = await tx.wait();

      const announcerAddress = (await announcer.getAddress()).toLowerCase();
      const announcementLogs = receipt!.logs.filter(
        (log) => log.address.toLowerCase() === announcerAddress
      );
      expect(announcementLogs.length).to.equal(2);

      for (let i = 0; i < stealthAddresses.length; i++) {
        expect(await token.balanceOf(stealthAddresses[i])).to.equal(amounts[i]);
      }
    });
  });
});
