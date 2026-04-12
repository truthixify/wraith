import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AgentInfo {
  id: string;
  name: string;
  address: string;
  metaAddress: string;
}

interface ChatMessage {
  role: "user" | "agent" | "tool" | "system";
  text: string;
}

interface ToolCall {
  name: string;
  status: string;
  detail?: string;
}

interface ChatResponse {
  response: string;
  toolCalls?: ToolCall[];
  conversationId?: string;
}

interface Conversation {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const LS_SERVER_URL = "wraith_server_url";
const LS_AGENT_ID = "wraith_agent_id";
const LS_WALLET = "wraith_wallet";
const DEFAULT_SERVER_URL = "http://localhost:3002";

interface CommandParam {
  key: string;
  label: string;
  placeholder: string;
  options?: string[];
}

interface SlashCommand {
  command: string;
  description: string;
  params: CommandParam[];
  buildMessage: (values: Record<string, string>) => string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    command: "/send",
    description: "Send ETH privately via stealth address",
    params: [
      { key: "recipient", label: "Recipient", placeholder: "alice.wraith or st:eth:..." },
      { key: "amount", label: "Amount (ETH)", placeholder: "0.1" },
    ],
    buildMessage: (v) => `Send ${v.amount} ETH to ${v.recipient}`,
  },
  {
    command: "/scan",
    description: "Scan for incoming stealth payments",
    params: [],
    buildMessage: () => "Scan for incoming stealth payments and show balances",
  },
  {
    command: "/balance",
    description: "Check agent wallet balance",
    params: [],
    buildMessage: () => "What's my current balance?",
  },
  {
    command: "/withdraw",
    description: "Withdraw from stealth address to destination",
    params: [
      { key: "from", label: "From stealth address", placeholder: "0x..." },
      { key: "to", label: "To destination", placeholder: "0x..." },
    ],
    buildMessage: (v) => `Withdraw all funds from stealth address ${v.from} to ${v.to}`,
  },
  {
    command: "/withdraw_all",
    description: "Withdraw from all stealth addresses",
    params: [
      { key: "to", label: "Destination address", placeholder: "0x..." },
    ],
    buildMessage: (v) => `Withdraw all my stealth funds to ${v.to} with maximum privacy`,
  },
  {
    command: "/invoice",
    description: "Create a payment invoice",
    params: [
      { key: "amount", label: "Amount (ETH)", placeholder: "0.1" },
      { key: "memo", label: "Memo", placeholder: "payment for services" },
    ],
    buildMessage: (v) => `Create an invoice for ${v.amount} ETH with memo "${v.memo}"`,
  },
  {
    command: "/invoices",
    description: "Check status of all invoices",
    params: [],
    buildMessage: () => "Check the status of all my invoices. Show which are paid and which are pending.",
  },
  {
    command: "/pay_agent",
    description: "Pay another .wraith agent",
    params: [
      { key: "name", label: "Agent name", placeholder: "oracle" },
      { key: "amount", label: "Amount (ETH)", placeholder: "0.05" },
    ],
    buildMessage: (v) => `Pay ${v.amount} ETH to ${v.name}.wraith`,
  },
  {
    command: "/resolve",
    description: "Look up a .wraith name",
    params: [
      { key: "name", label: "Name", placeholder: "alice" },
    ],
    buildMessage: (v) => `Resolve ${v.name}.wraith`,
  },
  {
    command: "/privacy",
    description: "Get privacy advice for your activity",
    params: [],
    buildMessage: () => "Analyze my stealth address activity and give me privacy recommendations. Check for timing patterns, address reuse, and suggest improvements.",
  },
  {
    command: "/fund",
    description: "Fund agent wallet with testnet ETH",
    params: [],
    buildMessage: () => "Fund my wallet with testnet ETH",
  },
  {
    command: "/info",
    description: "Show agent identity and status",
    params: [],
    buildMessage: () => "Show my full agent info including balance and stealth meta-address",
  },
  {
    command: "/schedule",
    description: "Schedule a recurring payment",
    params: [
      { key: "recipient", label: "Recipient", placeholder: "alice.wraith" },
      { key: "amount", label: "Amount", placeholder: "0.05" },
      { key: "interval", label: "Interval", placeholder: "Choose interval", options: ["daily", "weekly", "monthly"] },
    ],
    buildMessage: (v) => `Schedule a recurring payment of ${v.amount} ETH to ${v.recipient} (${v.interval})`,
  },
  {
    command: "/schedules",
    description: "List scheduled recurring payments",
    params: [],
    buildMessage: () => "List all my scheduled recurring payments",
  },
  {
    command: "/manage_schedule",
    description: "Pause, resume, or cancel a schedule",
    params: [
      { key: "id", label: "Schedule ID", placeholder: "aa67b310" },
      { key: "action", label: "Action", placeholder: "Choose action", options: ["pause", "resume", "cancel"] },
    ],
    buildMessage: (v) => `${v.action} scheduled payment ${v.id}`,
  },
  {
    command: "/agents",
    description: "Browse all registered agents",
    params: [],
    buildMessage: () => "",
  },
  {
    command: "/help",
    description: "Show all available commands",
    params: [],
    buildMessage: () => "",
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function truncateKey(key: string, len = 4): string {
  if (key.length <= len * 2 + 3) return key;
  return `${key.slice(0, len)}...${key.slice(-len)}`;
}

/* ------------------------------------------------------------------ */
/*  Chat Page                                                          */
/* ------------------------------------------------------------------ */

export default function Chat() {
  const { address: wagmiAddress, isConnected: walletIsConnected } = useAccount();

  /* --- state ------------------------------------------------------- */
  const [serverUrl, setServerUrl] = useState<string>(
    () => localStorage.getItem(LS_SERVER_URL) || DEFAULT_SERVER_URL
  );
  const [agentId, setAgentId] = useState<string | null>(
    () => localStorage.getItem(LS_AGENT_ID)
  );
  const [walletAddress, setWalletAddress] = useState<string | null>(
    () => localStorage.getItem(LS_WALLET)
  );
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportedKey, setExportedKey] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

  const [activeCommand, setActiveCommand] = useState<SlashCommand | null>(null);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardValues, setWizardValues] = useState<Record<string, string>>({});

  const [notifications, setNotifications] = useState<Array<{ id: number; type: string; title: string; body: string; read: number; created_at: number }>>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);

  const [showTour, setShowTour] = useState(false);
  const [tourStep, setTourStep] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [cmdHistoryIndex, setCmdHistoryIndex] = useState(-1);
  const cmdDraft = useRef("");

  const filteredCommands = showSlashMenu
    ? SLASH_COMMANDS.filter((c) =>
        c.command.startsWith(slashFilter.toLowerCase())
      )
    : [];

  /* --- sync wagmi wallet address ----------------------------------- */
  useEffect(() => {
    if (walletIsConnected && wagmiAddress) {
      setWalletAddress(wagmiAddress);
    } else if (!walletIsConnected) {
      setWalletAddress(null);
      setAgentId(null);
      setAgentInfo(null);
      setIsConnected(false);
      setMessages([]);
      localStorage.removeItem(LS_WALLET);
      localStorage.removeItem(LS_AGENT_ID);
    }
  }, [walletIsConnected, wagmiAddress]);

  /* --- auto-scroll ------------------------------------------------- */
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  /* --- persist server url ------------------------------------------ */
  useEffect(() => {
    localStorage.setItem(LS_SERVER_URL, serverUrl);
  }, [serverUrl]);

  /* --- persist agent id -------------------------------------------- */
  useEffect(() => {
    if (agentId) {
      localStorage.setItem(LS_AGENT_ID, agentId);
    } else {
      localStorage.removeItem(LS_AGENT_ID);
    }
  }, [agentId]);

  /* --- persist wallet address -------------------------------------- */
  useEffect(() => {
    if (walletAddress) {
      localStorage.setItem(LS_WALLET, walletAddress);
    } else {
      localStorage.removeItem(LS_WALLET);
    }
  }, [walletAddress]);

  /* --- on mount: check wallet -> check agent ----------------------- */
  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!walletAddress) {
        setInitialLoading(false);
        return;
      }

      if (!agentId) {
        try {
          const res = await fetch(`${serverUrl}/agent/wallet/${walletAddress}`);
          if (res.ok) {
            const data = await res.json();
            if (cancelled) return;
            const info: AgentInfo = {
              id: data.id,
              name: data.name,
              address: data.address,
              metaAddress: data.metaAddress,
            };
            setAgentInfo(info);
            setAgentId(data.id);
            setIsConnected(true);
            setMessages([
              {
                role: "system",
                text: `Agent ${info.name}.wraith connected.\nWallet: ${truncateKey(info.address)}\nReady to assist.`,
              },
            ]);
          }
        } catch {
          // Server unreachable
        }
        if (!cancelled) setInitialLoading(false);
        return;
      }

      try {
        const res = await fetch(`${serverUrl}/agent/${agentId}`);
        if (!res.ok) throw new Error("Agent not found");
        const data = await res.json();
        if (cancelled) return;

        const info: AgentInfo = {
          id: data.id ?? agentId!,
          name: data.name,
          address: data.address,
          metaAddress: data.metaAddress,
        };
        setAgentInfo(info);
        setIsConnected(true);

        setMessages([
          {
            role: "system",
            text: `Agent ${info.name}.wraith connected.\nWallet: ${truncateKey(info.address)}\nReady to assist.`,
          },
        ]);
      } catch {
        setAgentId(null);
        setAgentInfo(null);
        setIsConnected(false);
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [agentId, walletAddress, serverUrl]);

  /* --- fetch conversations ----------------------------------------- */
  useEffect(() => {
    if (!agentInfo || !agentId) return;
    fetch(`${serverUrl}/agent/${agentId}/conversations`)
      .then(r => r.json())
      .then(convs => setConversations(convs))
      .catch(() => {});
  }, [agentInfo, agentId, serverUrl]);

  /* --- poll notifications ------------------------------------------ */
  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;

    async function fetchNotifs() {
      try {
        const res = await fetch(`${serverUrl}/agent/${agentId}/notifications`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      } catch {
        // ignore
      }
    }

    fetchNotifs();
    const interval = setInterval(fetchNotifs, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [agentId, serverUrl]);

  /* --- mark notifications read ------------------------------------ */
  async function markNotifsRead() {
    if (!agentId || unreadCount === 0) return;
    try {
      await fetch(`${serverUrl}/agent/${agentId}/notifications/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: 1 })));
    } catch {
      // ignore
    }
  }

  /* --- guided tour trigger ---------------------------------------- */
  useEffect(() => {
    if (!agentInfo) return;
    const tourKey = `wraith_tour_done_${agentInfo.id}`;
    if (!localStorage.getItem(tourKey)) {
      setShowTour(true);
    }
  }, [agentInfo]);

  function dismissTour() {
    if (agentInfo) {
      localStorage.setItem(`wraith_tour_done_${agentInfo.id}`, "1");
    }
    setShowTour(false);
    setTourStep(0);
  }

  /* --- load conversation ------------------------------------------- */
  async function loadConversation(convId: string) {
    setActiveConvId(convId);
    try {
      const res = await fetch(`${serverUrl}/agent/${agentId}/conversations/${convId}/messages`);
      const msgs = await res.json();
      setMessages(msgs.map((m: any) => ({ role: m.role, text: m.text })));
    } catch {
      setMessages([]);
    }
  }

  /* --- new chat ---------------------------------------------------- */
  function handleNewChat() {
    setActiveConvId(null);
    setMessages([{
      role: "system",
      text: `${agentInfo?.name}.wraith ready. Type / for commands.`,
    }]);
  }

  /* --- delete conversation ----------------------------------------- */
  async function handleDeleteConv(convId: string) {
    try {
      await fetch(`${serverUrl}/agent/${agentId}/conversations/${convId}`, {
        method: "DELETE",
      });
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeConvId === convId) {
        handleNewChat();
      }
    } catch {
      // ignore
    }
  }

  /* --- create agent ------------------------------------------------ */
  async function handleCreate() {
    const name = nameInput.trim().toLowerCase();
    if (!name || !walletAddress) return;

    setIsCreating(true);
    setCreateError(null);

    try {
      const res = await fetch(`${serverUrl}/agent/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, ownerWallet: walletAddress }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Server error" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const info: AgentInfo = {
        id: data.id,
        name: data.name,
        address: data.address,
        metaAddress: data.metaAddress,
      };

      setAgentInfo(info);
      setAgentId(data.id);
      setIsConnected(true);
      setMessages([
        {
          role: "system",
          text: `Agent ${info.name}.wraith created.\nAddress: ${truncateKey(info.address)}\nReady to assist.`,
        },
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to create agent";
      setCreateError(msg);
    } finally {
      setIsCreating(false);
    }
  }

  /* --- select slash command ----------------------------------------- */
  function selectCommand(cmd: SlashCommand) {
    setShowSlashMenu(false);
    setInput("");

    if (cmd.command === "/help") {
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          text: SLASH_COMMANDS.filter((c) => c.command !== "/help" && c.command !== "/agents")
            .map((c) => `${c.command} — ${c.description}`).join("\n"),
        },
      ]);
      return;
    }

    if (cmd.command === "/agents") {
      window.open("/agents", "_blank");
      return;
    }

    if (cmd.params.length === 0) {
      const msg = cmd.buildMessage({});
      setInput(msg);
      setTimeout(() => handleSendMessage(msg), 0);
      return;
    }

    setActiveCommand(cmd);
    setWizardStep(0);
    setWizardValues({});
    setInput("");
  }

  function handleWizardInput() {
    if (!activeCommand) return;
    const val = input.trim();
    if (!val) return;

    const param = activeCommand.params[wizardStep];
    const newValues = { ...wizardValues, [param.key]: val };
    setWizardValues(newValues);
    setInput("");

    if (wizardStep + 1 < activeCommand.params.length) {
      setWizardStep(wizardStep + 1);
    } else {
      const msg = activeCommand.buildMessage(newValues);
      setActiveCommand(null);
      setWizardStep(0);
      setWizardValues({});
      handleSendMessage(msg);
    }
  }

  /* --- send message ------------------------------------------------ */
  function handleSendMessage(text: string) {
    if (!text || isLoading || !agentId) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    setCmdHistory((prev) => [...prev, trimmed]);
    setCmdHistoryIndex(-1);
    cmdDraft.current = "";

    const userMsg: ChatMessage = { role: "user", text: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    sendToServer(trimmed);
  }

  async function handleSend() {
    if (activeCommand) {
      handleWizardInput();
      return;
    }
    const text = input.trim();
    if (!text || isLoading || !agentId) return;
    handleSendMessage(text);
  }

  async function sendToServer(text: string) {
    try {
      const history = messages
        .filter((m) => m.role === "user" || m.role === "agent")
        .map((m) => ({
          role: m.role === "user" ? "user" : "model",
          text: m.text,
        }));

      const res = await fetch(`${serverUrl}/agent/${agentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history, conversationId: activeConvId, clientOrigin: window.location.origin }),
      });

      if (!res.ok) {
        throw new Error(`Server error (${res.status})`);
      }

      const data: ChatResponse = await res.json();

      if (data.toolCalls && data.toolCalls.length > 0) {
        const toolMessages: ChatMessage[] = data.toolCalls.map((tc) => ({
          role: "tool" as const,
          text: `${tc.name}\n${tc.detail || tc.status}`,
        }));
        setMessages((prev) => [...prev, ...toolMessages]);
      }

      setMessages((prev) => [...prev, { role: "agent", text: data.response }]);
      setIsConnected(true);

      if (data.conversationId) {
        setActiveConvId(data.conversationId);
        fetch(`${serverUrl}/agent/${agentId}/conversations`)
          .then(r => r.json())
          .then(convs => setConversations(convs))
          .catch(() => {});
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setMessages((prev) => [
        ...prev,
        { role: "system", text: `Error: ${msg}. Check server connection.` },
      ]);
      setIsConnected(false);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }

  /* --- key handler ------------------------------------------------- */
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }

    if (e.key === "ArrowUp" && cmdHistory.length > 0) {
      e.preventDefault();
      if (cmdHistoryIndex === -1) {
        cmdDraft.current = input;
      }
      const newIndex = cmdHistoryIndex === -1
        ? cmdHistory.length - 1
        : Math.max(0, cmdHistoryIndex - 1);
      setCmdHistoryIndex(newIndex);
      setInput(cmdHistory[newIndex]);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (cmdHistoryIndex === -1) return;
      const newIndex = cmdHistoryIndex + 1;
      if (newIndex >= cmdHistory.length) {
        setCmdHistoryIndex(-1);
        setInput(cmdDraft.current);
      } else {
        setCmdHistoryIndex(newIndex);
        setInput(cmdHistory[newIndex]);
      }
      return;
    }
  }

  /* --- disconnect / reset ------------------------------------------ */
  function handleDisconnect() {
    setAgentId(null);
    setAgentInfo(null);
    setMessages([]);
    setIsConnected(false);
    setWalletAddress(null);
    localStorage.removeItem(LS_WALLET);
    localStorage.removeItem(LS_AGENT_ID);
  }

  /* --- loading screen ---------------------------------------------- */
  if (initialLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-surface">
        <div className="text-center">
          <img src="/logo.png" alt="Wraith" className="h-14 mx-auto mb-4 opacity-80" />
          <div className="flex items-center justify-center gap-1">
            <span
              className="inline-block h-1.5 w-1.5 bg-[#acabaa] animate-pulse-dots"
              style={{ animationDelay: "0s" }}
            />
            <span
              className="inline-block h-1.5 w-1.5 bg-[#acabaa] animate-pulse-dots"
              style={{ animationDelay: "0.2s" }}
            />
            <span
              className="inline-block h-1.5 w-1.5 bg-[#acabaa] animate-pulse-dots"
              style={{ animationDelay: "0.4s" }}
            />
          </div>
        </div>
      </div>
    );
  }

  /* --- wallet connect screen --------------------------------------- */
  if (!walletAddress) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-surface">
        <div className="w-full max-w-md px-6">
          <div className="text-center mb-10">
            <img src="/logo.png" alt="Wraith" className="h-16 mx-auto mb-4 opacity-80" />
            <p className="font-headline text-title-lg text-primary tracking-tight mb-3">AGENT</p>
            <p className="text-body-lg text-[#acabaa]">
              Connect your wallet to create or access your private AI agent.
            </p>
          </div>

          <ConnectButton.Custom>
            {({ openConnectModal, mounted }) => {
              if (!mounted) return null;
              return (
                <button
                  onClick={openConnectModal}
                  className="w-full bg-primary text-primary-on-primary py-3 px-6 font-label text-label-lg uppercase tracking-wider transition-colors hover:bg-[#d4d4d5]"
                >
                  Connect Wallet
                </button>
              );
            }}
          </ConnectButton.Custom>
        </div>
      </div>
    );
  }

  /* --- creation screen --------------------------------------------- */
  if (!agentInfo) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-surface">
        <div className="w-full max-w-md px-6">
          {/* Header */}
          <div className="text-center mb-10">
            <img src="/logo.png" alt="Wraith" className="h-16 mx-auto mb-4 opacity-80" />
            <p className="font-headline text-title-lg text-primary tracking-tight mb-3">AGENT</p>
            <p className="text-body-lg text-[#acabaa]">
              Create your private AI agent on Horizen
            </p>
            <p className="text-body-sm text-[#767575] mt-2">
              Wallet: {truncateKey(walletAddress, 6)}
            </p>
          </div>

          {/* Name input */}
          <div className="mb-6">
            <div className="flex items-center border border-outline-variant bg-surface-container-lowest">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => {
                  setNameInput(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""));
                  setCreateError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
                placeholder="Choose a name"
                className="flex-1 bg-transparent px-4 py-3 text-body-lg text-on-surface placeholder:text-[#767575] outline-none"
                disabled={isCreating}
              />
              <span className="pr-4 text-body-lg text-[#767575] select-none">
                .wraith
              </span>
            </div>
          </div>

          {/* Error */}
          {createError && (
            <div className="mb-4 px-1 text-body-sm text-error animate-fade-in">
              {createError}
            </div>
          )}

          {/* Create button */}
          <button
            onClick={handleCreate}
            disabled={isCreating || !nameInput.trim()}
            className="w-full bg-primary text-primary-on-primary py-3 px-6 font-label text-label-lg uppercase tracking-wider transition-colors hover:bg-[#d4d4d5] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isCreating ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block h-1.5 w-1.5 bg-surface animate-pulse-dots" style={{ animationDelay: "0s" }} />
                <span className="inline-block h-1.5 w-1.5 bg-surface animate-pulse-dots" style={{ animationDelay: "0.2s" }} />
                <span className="inline-block h-1.5 w-1.5 bg-surface animate-pulse-dots" style={{ animationDelay: "0.4s" }} />
              </span>
            ) : (
              "Create Agent"
            )}
          </button>

          {/* Info */}
          <div className="mt-8 space-y-2 text-body-sm text-[#767575]">
            <p className="text-[#acabaa] mb-3">This will:</p>
            <ul className="space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-[#acabaa] mt-0.5">&#8226;</span>
                <span>Generate an EVM wallet</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#acabaa] mt-0.5">&#8226;</span>
                <span>Derive stealth keys</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#acabaa] mt-0.5">&#8226;</span>
                <span>Register your .wraith name</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#acabaa] mt-0.5">&#8226;</span>
                <span>Fund with testnet ETH</span>
              </li>
            </ul>
          </div>

          {/* Disconnect wallet */}
          <div className="mt-10 border-t border-outline-variant pt-4 flex justify-end">
            <button
              onClick={handleDisconnect}
              className="flex items-center gap-2 text-label-sm text-[#767575] hover:text-error transition-colors"
            >
              <DisconnectIcon />
              <span>Disconnect</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* --- chat screen ------------------------------------------------- */
  return (
    <div className="flex h-screen w-screen bg-surface">
      {/* Sidebar */}
      {sidebarOpen && (
        <aside className="w-64 flex-shrink-0 border-r border-outline-variant bg-[#0a0a0a] flex flex-col">
          {/* New chat button */}
          <div className="p-3 border-b border-outline-variant">
            <button
              onClick={handleNewChat}
              className="w-full py-2 px-3 text-label-sm text-primary border border-outline-variant hover:bg-[#1f2020] transition-colors text-left"
            >
              + New Chat
            </button>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center border-b border-[#1a1a1a] transition-colors ${
                  conv.id === activeConvId
                    ? "bg-[#1f2020] text-on-surface"
                    : "text-[#767575] hover:bg-[#131313] hover:text-[#acabaa]"
                }`}
              >
                <button
                  onClick={() => loadConversation(conv.id)}
                  className="flex-1 text-left px-3 py-2.5 text-body-sm truncate"
                >
                  {conv.title}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteConv(conv.id);
                  }}
                  className="hidden group-hover:block flex-shrink-0 px-2 py-1 mr-1 text-[#767575] hover:text-red-400 transition-colors"
                  title="Delete conversation"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                    <path d="M3.05 2.05a1 1 0 011.41 0L6 3.59l1.54-1.54a1 1 0 111.41 1.41L7.41 5l1.54 1.54a1 1 0 01-1.41 1.41L6 6.41 4.46 7.95a1 1 0 01-1.41-1.41L4.59 5 3.05 3.46a1 1 0 010-1.41z"/>
                  </svg>
                </button>
              </div>
            ))}
            {conversations.length === 0 && (
              <p className="px-3 py-4 text-xs text-[#484848]">No conversations yet</p>
            )}
          </div>

          {/* Sidebar bottom links */}
          <div className="flex-shrink-0 border-t border-outline-variant p-3 space-y-1">
            <a
              href="/agents"
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#767575] hover:text-[#acabaa] hover:bg-[#131313] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <path d="M7 7a3 3 0 100-6 3 3 0 000 6zm-5 7a5 5 0 0110 0H2z"/>
              </svg>
              Browse Agents
            </a>
            {agentInfo && (
              <a
                href={`/agent/${agentInfo.name}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#767575] hover:text-[#acabaa] hover:bg-[#131313] transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <path d="M3 1h8a2 2 0 012 2v8a2 2 0 01-2 2H3a2 2 0 01-2-2V3a2 2 0 012-2zm1 3v1h6V4H4zm0 3v1h6V7H4zm0 3v1h4v-1H4z"/>
                </svg>
                My Profile Card
              </a>
            )}
            <button
              onClick={() => { setSettingsOpen(true); setExportedKey(null); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#767575] hover:text-[#acabaa] hover:bg-[#131313] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <path d="M7 9a2 2 0 100-4 2 2 0 000 4zm5.64-1.8l-.96-.56a4.5 4.5 0 000-1.28l.96-.56a.5.5 0 00.18-.68l-1-1.73a.5.5 0 00-.68-.18l-.96.56a4.5 4.5 0 00-1.1-.64V1.5a.5.5 0 00-.5-.5h-2a.5.5 0 00-.5.5v1.13a4.5 4.5 0 00-1.1.64l-.96-.56a.5.5 0 00-.68.18l-1 1.73a.5.5 0 00.18.68l.96.56a4.5 4.5 0 000 1.28l-.96.56a.5.5 0 00-.18.68l1 1.73a.5.5 0 00.68.18l.96-.56c.33.27.7.49 1.1.64v1.13a.5.5 0 00.5.5h2a.5.5 0 00.5-.5v-1.13a4.5 4.5 0 001.1-.64l.96.56a.5.5 0 00.68-.18l1-1.73a.5.5 0 00-.18-.68z"/>
              </svg>
              Settings
            </button>
          </div>
        </aside>
      )}

      {/* Settings modal */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="bg-[#131313] border border-outline-variant w-full max-w-md mx-4 p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-headline text-lg font-bold text-primary uppercase tracking-tight">Settings</h2>
              <button
                onClick={() => setSettingsOpen(false)}
                className="text-[#767575] hover:text-on-surface text-sm"
              >
                ✕
              </button>
            </div>

            <div>
              <h3 className="text-[10px] font-headline uppercase tracking-widest text-[#acabaa] mb-2">Agent Details</h3>
              <div className="space-y-1.5 text-xs text-[#767575]">
                <p>Name: <span className="text-on-surface">{agentInfo?.name}.wraith</span></p>
                <p>Address: <span className="text-on-surface font-mono text-[10px] break-all">{agentInfo?.address}</span></p>
                <p>Meta-Address: <span className="text-on-surface font-mono text-[10px] break-all">{agentInfo?.metaAddress?.slice(0, 30)}...</span></p>
                <p>Owner Wallet: <span className="text-on-surface">{truncateKey(walletAddress, 6)}</span></p>
                <p>Network: <span className="text-on-surface">Horizen Testnet</span></p>
              </div>
            </div>

            <div className="border-t border-outline-variant pt-4">
              <h3 className="text-[10px] font-headline uppercase tracking-widest text-[#acabaa] mb-2">Export Private Key</h3>
              <p className="text-[10px] text-[#484848] mb-3">Back up your agent's wallet. Keep this secret — anyone with this key controls the wallet.</p>
              {!exportedKey ? (
                <button
                  onClick={async () => {
                    setExportLoading(true);
                    try {
                      const res = await fetch(`${serverUrl}/agent/${agentId}/export`);
                      const data = await res.json();
                      if (data.secret) setExportedKey(data.secret);
                    } catch {}
                    setExportLoading(false);
                  }}
                  disabled={exportLoading}
                  className="text-xs py-2 px-4 border border-outline-variant text-[#acabaa] hover:text-on-surface hover:bg-[#1f2020] transition-colors disabled:opacity-30"
                >
                  {exportLoading ? "..." : "Reveal Private Key"}
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="bg-[#0a0a0a] border border-error/20 p-3">
                    <p className="text-[9px] uppercase tracking-widest text-error mb-1.5 font-headline font-bold">Sensitive — do not share</p>
                    <code className="text-[10px] text-on-surface break-all font-mono leading-relaxed">{exportedKey}</code>
                  </div>
                  <button
                    onClick={() => navigator.clipboard.writeText(exportedKey)}
                    className="text-[10px] text-[#767575] hover:text-on-surface transition-colors"
                  >
                    Copy to clipboard
                  </button>
                </div>
              )}
            </div>

            <div className="border-t border-outline-variant pt-4">
              <button
                onClick={handleDisconnect}
                className="text-xs py-2 px-4 border border-error/30 text-error hover:bg-error/10 transition-colors"
              >
                Disconnect Agent
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="flex-shrink-0 border-b border-outline-variant">
          <div className="flex items-center justify-between px-4 py-3">
            {/* Left: Toggle + Logo */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-1 text-[#767575] hover:text-[#acabaa] transition-colors mr-2"
                title="Toggle sidebar"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="1" y="3" width="14" height="1.5" />
                  <rect x="1" y="7.25" width="14" height="1.5" />
                  <rect x="1" y="11.5" width="14" height="1.5" />
                </svg>
              </button>
              <img src="/logo.png" alt="Wraith" className="h-7 opacity-80" />
            </div>

            {/* Right: Agent name + wallet + status */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-2 w-2 ${
                    isConnected ? "bg-green-500" : "bg-[#767575]"
                  }`}
                />
                <span className="font-label text-label-lg text-[#acabaa]">
                  {agentInfo.name}.wraith
                </span>
                <span className="text-label-sm text-[#767575]">
                  ({truncateKey(walletAddress, 4)})
                </span>
              </div>

              {/* Notifications */}
              <div className="relative">
                <button
                  onClick={() => {
                    setNotifOpen(!notifOpen);
                    if (!notifOpen && unreadCount > 0) markNotifsRead();
                  }}
                  className="p-1 text-[#767575] hover:text-[#acabaa] transition-colors relative"
                  title="Notifications"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 1.5A4.5 4.5 0 003.5 6v2.5l-1 2h11l-1-2V6A4.5 4.5 0 008 1.5zM6.5 12a1.5 1.5 0 003 0h-3z"/>
                  </svg>
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 bg-red-500 text-white text-[8px] font-bold flex items-center justify-center rounded-full">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>

                {/* Notification dropdown */}
                {notifOpen && (
                  <div className="absolute right-0 top-full mt-2 w-80 bg-[#131313] border border-[#252626] shadow-xl z-50 max-h-80 overflow-y-auto">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-[#252626]">
                      <span className="text-xs text-[#acabaa] font-bold uppercase tracking-wider">Notifications</span>
                      {unreadCount > 0 && (
                        <button
                          onClick={() => markNotifsRead()}
                          className="text-[10px] text-[#767575] hover:text-[#acabaa]"
                        >
                          Mark all as read
                        </button>
                      )}
                    </div>
                    {notifications.length === 0 ? (
                      <p className="px-3 py-6 text-xs text-[#484848] text-center">No notifications yet</p>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          className={`px-3 py-2.5 border-b border-[#1a1a1a] ${
                            n.read ? "opacity-60" : ""
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={`h-1.5 w-1.5 flex-shrink-0 ${
                              n.type === "invoice_paid" ? "bg-green-500" :
                              n.type === "payment_sent" ? "bg-blue-400" :
                              n.type === "payment_received" ? "bg-green-400" :
                              n.type === "withdrawal" ? "bg-yellow-400" :
                              "bg-[#767575]"
                            }`} />
                            <span className="text-xs font-bold text-[#acabaa]">{n.title}</span>
                          </div>
                          <p className="text-[11px] text-[#767575] ml-3.5">{n.body}</p>
                          <p className="text-[9px] text-[#484848] ml-3.5 mt-1">
                            {new Date(n.created_at * 1000).toLocaleString()}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Disconnect */}
              <button
                onClick={handleDisconnect}
                className="p-1 text-[#767575] hover:text-error transition-colors"
                title="Disconnect agent"
              >
                <DisconnectIcon />
              </button>
            </div>
          </div>

        </header>

        {/* Messages */}
        <main className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex items-start gap-3 animate-fade-in">
              <div className="bg-[#131313] border border-outline-variant px-4 py-3">
                <div className="flex items-center gap-1">
                  <span
                    className="inline-block h-1.5 w-1.5 bg-[#acabaa] animate-pulse-dots"
                    style={{ animationDelay: "0s" }}
                  />
                  <span
                    className="inline-block h-1.5 w-1.5 bg-[#acabaa] animate-pulse-dots"
                    style={{ animationDelay: "0.2s" }}
                  />
                  <span
                    className="inline-block h-1.5 w-1.5 bg-[#acabaa] animate-pulse-dots"
                    style={{ animationDelay: "0.4s" }}
                  />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </main>

        {/* Input bar */}
        <footer className="flex-shrink-0 border-t border-outline-variant bg-surface-container-lowest relative">
          {/* Slash command menu */}
          {showSlashMenu && filteredCommands.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 border-t border-outline-variant bg-[#191a1a] max-h-64 overflow-y-auto" id="slash-menu">
              {filteredCommands.map((cmd, i) => (
                <button
                  key={cmd.command}
                  ref={(el) => { if (i === slashIndex && el) el.scrollIntoView({ block: "nearest" }); }}
                  className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                    i === slashIndex
                      ? "bg-[#252626]"
                      : "hover:bg-[#1f2020]"
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectCommand(cmd);
                    inputRef.current?.focus();
                  }}
                >
                  <span className="font-headline text-sm text-primary">{cmd.command}</span>
                  <span className="text-xs text-[#acabaa]">{cmd.description}</span>
                </button>
              ))}
            </div>
          )}

          {/* Wizard progress bar */}
          {activeCommand && (
            <div className="border-b border-outline-variant bg-[#191a1a]">
              <div className="flex items-center gap-2 px-4 py-2">
                <span className="text-xs font-headline text-primary uppercase tracking-widest">
                  {activeCommand.command}
                </span>
                <span className="text-xs text-[#767575]">{"\u2014"}</span>
                {activeCommand.params.map((p, i) => (
                  <span
                    key={p.key}
                    className={`text-xs font-headline ${
                      i < wizardStep
                        ? "text-primary"
                        : i === wizardStep
                        ? "text-on-surface"
                        : "text-[#484848]"
                    }`}
                  >
                    {i < wizardStep ? `${p.label}: ${wizardValues[p.key]}` : p.label}
                    {i < activeCommand.params.length - 1 && (
                      <span className="text-[#484848] mx-1">{"\u2192"}</span>
                    )}
                  </span>
                ))}
                <button
                  onClick={() => {
                    setActiveCommand(null);
                    setWizardStep(0);
                    setWizardValues({});
                    setInput("");
                  }}
                  className="ml-auto text-xs text-[#767575] hover:text-on-surface"
                >
                  esc
                </button>
              </div>
              {/* Option buttons when current step has options */}
              {activeCommand.params[wizardStep]?.options && (
                <div className="flex gap-2 px-4 pb-2">
                  {activeCommand.params[wizardStep].options!.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => {
                        const param = activeCommand.params[wizardStep];
                        const newValues = { ...wizardValues, [param.key]: opt };
                        setWizardValues(newValues);
                        setInput("");

                        if (wizardStep + 1 < activeCommand.params.length) {
                          setWizardStep(wizardStep + 1);
                        } else {
                          const msg = activeCommand.buildMessage(newValues);
                          setActiveCommand(null);
                          setWizardStep(0);
                          setWizardValues({});
                          handleSendMessage(msg);
                        }
                      }}
                      className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider border border-[#484848] text-[#acabaa] hover:bg-[#1f2020] hover:text-[#c6c6c7] transition-colors"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className={`flex items-center gap-2 px-4 py-3${activeCommand?.params[wizardStep]?.options ? " hidden" : ""}`}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => {
                const val = e.target.value;
                setInput(val);
                if (val.startsWith("/")) {
                  setShowSlashMenu(true);
                  setSlashFilter(val);
                  setSlashIndex(0);
                } else {
                  setShowSlashMenu(false);
                }
              }}
              onKeyDown={(e) => {
                if (showSlashMenu && filteredCommands.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSlashIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSlashIndex((i) => Math.max(i - 1, 0));
                    return;
                  }
                  if (e.key === "Tab" || (e.key === "Enter" && showSlashMenu)) {
                    e.preventDefault();
                    selectCommand(filteredCommands[slashIndex]);
                    return;
                  }
                  if (e.key === "Escape") {
                    setShowSlashMenu(false);
                    return;
                  }
                }
                if (e.key === "Escape" && activeCommand) {
                  setActiveCommand(null);
                  setWizardStep(0);
                  setWizardValues({});
                  setInput("");
                  return;
                }
                handleKeyDown(e);
              }}
              onBlur={() => setTimeout(() => setShowSlashMenu(false), 150)}
              placeholder={
                activeCommand
                  ? `${activeCommand.params[wizardStep]?.label}: ${activeCommand.params[wizardStep]?.placeholder}`
                  : "Message your agent... (type / for commands)"
              }
              disabled={isLoading}
              className="flex-1 bg-transparent text-body-lg text-on-surface placeholder:text-[#767575] outline-none disabled:opacity-50"
              autoFocus
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="bg-primary text-primary-on-primary px-5 py-2 font-label text-label-lg uppercase tracking-wider transition-colors hover:bg-[#d4d4d5] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </footer>
      </div>

      {/* Close notif dropdown when clicking outside */}
      {notifOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setNotifOpen(false)}
        />
      )}

      {/* Guided Tour Overlay */}
      {showTour && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#131313] border border-[#252626] w-full max-w-lg">
            {/* Tour header */}
            <div className="flex items-center gap-3 px-6 pt-6 pb-4">
              <img src="/logo.png" alt="Wraith" className="h-10 opacity-80" />
              <div>
                <h2 className="text-lg font-bold text-[#c6c6c7]" style={{ fontFamily: "Space Grotesk, monospace" }}>
                  Welcome to Wraith
                </h2>
                <p className="text-xs text-[#767575]">Your private AI agent on Horizen</p>
              </div>
            </div>

            {/* Tour steps */}
            <div className="px-6 py-4 min-h-[200px]">
              {tourStep === 0 && (
                <div className="space-y-4 animate-fade-in">
                  <p className="text-sm text-[#acabaa]">
                    Your agent <span className="text-[#c6c6c7] font-bold">{agentInfo?.name}.wraith</span> is ready.
                    It has its own EVM wallet and stealth identity.
                  </p>
                  <div className="space-y-2 text-xs text-[#767575]">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 bg-green-500 flex-shrink-0" />
                      <span>Private wallet with stealth payment capabilities</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 bg-green-500 flex-shrink-0" />
                      <span>On-chain .wraith name for receiving payments</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 bg-green-500 flex-shrink-0" />
                      <span>AI-powered — just chat naturally</span>
                    </div>
                  </div>
                </div>
              )}

              {tourStep === 1 && (
                <div className="space-y-4 animate-fade-in">
                  <p className="text-sm text-[#acabaa] font-bold">What your agent can do:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { icon: "↗", label: "Send payments", desc: "Private stealth payments" },
                      { icon: "↙", label: "Receive payments", desc: "Scan incoming transfers" },
                      { icon: "📄", label: "Create invoices", desc: "Shareable payment links" },
                      { icon: "💰", label: "Withdraw funds", desc: "From stealth addresses" },
                      { icon: "🔍", label: "Privacy check", desc: "Analyze your activity" },
                      { icon: "🤝", label: "Pay agents", desc: "Agent-to-agent transfers" },
                    ].map((item) => (
                      <div key={item.label} className="bg-[#0e0e0e] border border-[#252626] p-3">
                        <span className="text-lg">{item.icon}</span>
                        <p className="text-xs text-[#c6c6c7] font-bold mt-1">{item.label}</p>
                        <p className="text-[10px] text-[#767575]">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tourStep === 2 && (
                <div className="space-y-4 animate-fade-in">
                  <p className="text-sm text-[#acabaa] font-bold">Quick start:</p>
                  <div className="space-y-3">
                    <div className="bg-[#0e0e0e] border border-[#252626] p-3">
                      <p className="text-xs text-[#c6c6c7] font-mono mb-1">1. Fund your agent</p>
                      <p className="text-[10px] text-[#767575]">Type <span className="text-[#acabaa] font-mono">/fund</span> to get testnet ETH</p>
                    </div>
                    <div className="bg-[#0e0e0e] border border-[#252626] p-3">
                      <p className="text-xs text-[#c6c6c7] font-mono mb-1">2. Send a payment</p>
                      <p className="text-[10px] text-[#767575]">Type <span className="text-[#acabaa] font-mono">/send</span> or just say "send 0.1 ETH to alice.wraith"</p>
                    </div>
                    <div className="bg-[#0e0e0e] border border-[#252626] p-3">
                      <p className="text-xs text-[#c6c6c7] font-mono mb-1">3. Use / for all commands</p>
                      <p className="text-[10px] text-[#767575]">Type <span className="text-[#acabaa] font-mono">/</span> to see every available command</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Tour navigation */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-[#252626]">
              <div className="flex gap-1.5">
                {[0, 1, 2].map((s) => (
                  <span
                    key={s}
                    className={`h-1.5 w-1.5 transition-colors ${
                      s === tourStep ? "bg-[#c6c6c7]" : "bg-[#484848]"
                    }`}
                  />
                ))}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={dismissTour}
                  className="text-xs text-[#767575] hover:text-[#acabaa] transition-colors"
                >
                  Skip
                </button>
                {tourStep < 2 ? (
                  <button
                    onClick={() => setTourStep(tourStep + 1)}
                    className="px-4 py-1.5 bg-[#c6c6c7] text-[#0e0e0e] text-xs font-bold uppercase tracking-wider hover:bg-[#d4d4d5] transition-colors"
                  >
                    Next
                  </button>
                ) : (
                  <button
                    onClick={dismissTour}
                    className="px-4 py-1.5 bg-[#c6c6c7] text-[#0e0e0e] text-xs font-bold uppercase tracking-wider hover:bg-[#d4d4d5] transition-colors"
                  >
                    Get Started
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MessageBubble                                                      */
/* ------------------------------------------------------------------ */

function MessageBubble({ message }: { message: ChatMessage }) {
  const { role, text } = message;

  if (role === "system") {
    return (
      <div className="animate-fade-in">
        <p className="text-body-sm text-[#acabaa] italic whitespace-pre-line break-words">
          {text}
        </p>
      </div>
    );
  }

  if (role === "tool") {
    const lines = text.split("\n");
    const toolName = lines[0] || "";
    const description = lines.slice(1).join("\n");

    return (
      <div className="flex items-start gap-3 animate-fade-in">
        <div className="max-w-[80%]">
          <div className="text-body-sm text-[#acabaa]">
            <span className="mr-1.5">&#9889;</span>
            <span className="font-bold">{toolName}</span>
          </div>
          {description && (
            <p className="text-body-sm text-[#767575] mt-0.5 whitespace-pre-line break-words">
              {description}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (role === "user") {
    return (
      <div className="flex justify-end animate-fade-in">
        <div className="max-w-[80%] overflow-hidden bg-[#1f2020] border border-outline-variant px-4 py-3">
          <p className="text-body-md text-on-surface whitespace-pre-line break-words">
            {text}
          </p>
        </div>
      </div>
    );
  }

  // agent
  return (
    <div className="flex items-start gap-3 animate-fade-in">
      <div className="max-w-[80%] overflow-hidden bg-[#131313] border border-outline-variant px-4 py-3 prose-wraith">
        <ReactMarkdown
          components={{
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
            ),
          }}
        >{text}</ReactMarkdown>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */

function SettingsIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function DisconnectIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
