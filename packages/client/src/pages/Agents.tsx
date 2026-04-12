import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";

interface AgentEntry {
  id: string;
  name: string;
  address: string;
  meta_address: string;
  created_at: number;
}

const SERVER_URL = localStorage.getItem("wraith_server_url") || "http://localhost:3002";

function truncateKey(key: string, len = 6): string {
  if (key.length <= len * 2 + 3) return key;
  return `${key.slice(0, len)}...${key.slice(-len)}`;
}

export default function Agents() {
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<AgentEntry | null>(null);

  useEffect(() => {
    fetch(`${SERVER_URL}/agents`)
      .then((r) => r.json())
      .then((data) => setAgents(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = search
    ? agents.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()))
    : agents;

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0e0e0e]">
        <div className="text-center">
          <img src="/logo.png" alt="Wraith" className="h-14 mx-auto mb-4 opacity-80" />
          <div className="flex items-center justify-center gap-1">
            <span className="inline-block h-1.5 w-1.5 bg-[#acabaa] animate-pulse-dots" style={{ animationDelay: "0s" }} />
            <span className="inline-block h-1.5 w-1.5 bg-[#acabaa] animate-pulse-dots" style={{ animationDelay: "0.2s" }} />
            <span className="inline-block h-1.5 w-1.5 bg-[#acabaa] animate-pulse-dots" style={{ animationDelay: "0.4s" }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-[#0e0e0e]">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-[#252626]">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <img src="/logo.png" alt="Wraith" className="h-7 opacity-80" />
            </Link>
            <span className="text-xs text-[#484848]">/</span>
            <span className="text-sm text-[#acabaa] font-bold" style={{ fontFamily: "Space Grotesk, monospace" }}>
              Agents
            </span>
          </div>
          <Link
            to="/"
            className="text-xs text-[#767575] hover:text-[#acabaa] transition-colors"
          >
            Back to Chat
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-8">
          {/* Title + Search */}
          <div className="mb-8">
            <h1
              className="text-2xl font-bold text-[#c6c6c7] mb-1"
              style={{ fontFamily: "Space Grotesk, monospace" }}
            >
              Agent Directory
            </h1>
            <p className="text-sm text-[#767575] mb-4">
              {agents.length} registered agent{agents.length !== 1 ? "s" : ""} on the network
            </p>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search agents..."
              className="w-full bg-[#131313] border border-[#252626] px-4 py-2.5 text-sm text-[#c6c6c7] placeholder:text-[#484848] outline-none focus:border-[#484848] transition-colors"
            />
          </div>

          {/* Agent grid */}
          {filtered.length === 0 ? (
            <p className="text-sm text-[#484848] text-center py-12">
              {search ? "No agents match your search" : "No agents registered yet"}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filtered.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgent(selectedAgent?.id === agent.id ? null : agent)}
                  className={`text-left bg-[#131313] border p-4 transition-colors ${
                    selectedAgent?.id === agent.id
                      ? "border-[#c6c6c7]"
                      : "border-[#252626] hover:border-[#484848]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="text-sm font-bold text-[#c6c6c7]"
                      style={{ fontFamily: "Space Grotesk, monospace" }}
                    >
                      {agent.name}.wraith
                    </span>
                    <span className="h-2 w-2 bg-green-500" title="Active" />
                  </div>
                  <p className="text-[10px] text-[#767575] font-mono">
                    {truncateKey(agent.address, 8)}
                  </p>
                  <p className="text-[10px] text-[#484848] mt-1">
                    Registered {new Date(agent.created_at * 1000).toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Agent detail panel */}
      {selectedAgent && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setSelectedAgent(null)}>
          <div
            className="bg-[#131313] border border-[#252626] w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 space-y-5">
              {/* Name */}
              <div className="text-center">
                <p
                  className="text-xl font-bold text-[#c6c6c7]"
                  style={{ fontFamily: "Space Grotesk, monospace" }}
                >
                  {selectedAgent.name}.wraith
                </p>
                <p className="text-xs text-[#767575] mt-1">Wraith Agent</p>
              </div>

              {/* QR Code */}
              <div className="flex justify-center">
                <div className="bg-white p-3">
                  <QRCodeCanvas
                    value={`${window.location.origin}/pay/${selectedAgent.name}`}
                    size={140}
                    bgColor="#ffffff"
                    fgColor="#0e0e0e"
                    level="M"
                  />
                </div>
              </div>

              {/* Details */}
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs text-[#767575]">Address</span>
                  <span className="text-xs text-[#acabaa] font-mono text-right break-all">
                    {truncateKey(selectedAgent.address, 10)}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs text-[#767575] whitespace-nowrap">Meta Address</span>
                  <span className="text-xs text-[#acabaa] font-mono text-right break-all">
                    {truncateKey(selectedAgent.meta_address, 10)}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs text-[#767575]">Registered</span>
                  <span className="text-xs text-[#acabaa]">
                    {new Date(selectedAgent.created_at * 1000).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Link
                  to={`/pay/${selectedAgent.name}`}
                  className="flex-1 py-2.5 bg-[#c6c6c7] text-[#0e0e0e] text-center text-xs font-bold uppercase tracking-wider hover:bg-[#d4d4d5] transition-colors"
                >
                  Pay
                </Link>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(selectedAgent.meta_address);
                  }}
                  className="flex-1 py-2.5 border border-[#484848] text-[#acabaa] text-center text-xs font-bold uppercase tracking-wider hover:bg-[#1f2020] transition-colors"
                >
                  Copy Address
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
