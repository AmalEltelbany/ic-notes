import React, { useState, useEffect } from "react"
import { AuthClient } from "@dfinity/auth-client"
import { createActor, canisterId } from "../../declarations/note-dapp-with-ii-backend"
import { Principal } from "@dfinity/principal"

// Floating particles component for a subtle, dynamic background
const FloatingParticles = () => {
  const particles = Array.from({ length: 20 }, (_, i) => (
    <div
      key={i}
      className="absolute rounded-full bg-gradient-to-r from-purple-400/30 to-pink-400/30 animate-float"
      style={{
        width: `${Math.random() * 6 + 2}px`,
        height: `${Math.random() * 6 + 2}px`,
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        animationDelay: `${Math.random() * 10}s`,
        animationDuration: `${Math.random() * 20 + 10}s`
      }}
    />
  ))

  return <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">{particles}</div>
}

const network = process.env.DFX_NETWORK
const identityProvider =
  network === "ic"
    ? "https://identity.ic0.app"
    : `http://${process.env.CANISTER_ID_INTERNET_IDENTITY}.localhost:4943`

function App() {
  const [authClient, setAuthClient] = useState(null)
  const [actor, setActor] = useState(null)
  const [principal, setPrincipal] = useState("")
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [notes, setNotes] = useState([])
  const [newNote, setNewNote] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [editingNoteId, setEditingNoteId] = useState(null)
  const [editingContent, setEditingContent] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [showAddNote, setShowAddNote] = useState(false)

  // Token-related state
  const [balance, setBalance] = useState(0)
  const [icrcBalance, setIcrcBalance] = useState(null)
  const [transferTo, setTransferTo] = useState("")
  const [transferAmount, setTransferAmount] = useState("")
  const [transactionHistory, setTransactionHistory] = useState([])
  const [showTokenSection, setShowTokenSection] = useState(false)
  const [showTransferForm, setShowTransferForm] = useState(false)
  const [transferStatus, setTransferStatus] = useState("")
  const [transferType, setTransferType] = useState("internal") // "internal" or "icrc"
  const [icrcLedgerCanisterId, setIcrcLedgerCanisterId] = useState("")
  const [showLedgerConfig, setShowLedgerConfig] = useState(false)

  useEffect(() => {
    initAuth()

    // Hide HTML loading screen once React is mounted
    const hideInitialLoading = () => {
      const loadingScreen = document.getElementById('initialLoading');
      if (loadingScreen) {
        loadingScreen.classList.add('fade-out');
        setTimeout(() => {
          loadingScreen.style.display = 'none';
        }, 500);
      }
    };

    // Hide loading screen after component mounts
    setTimeout(hideInitialLoading, 300);
  }, [])

  const initAuth = async () => {
    console.log("Initializing authentication...")
    setIsLoading(true)

    try {
      const client = await AuthClient.create()
      console.log("AuthClient created successfully")

      const identity = client.getIdentity()
      const isAuth = await client.isAuthenticated()
      console.log("Authentication status:", isAuth)

      const backendActor = createActor(canisterId, {
        agentOptions: {
          identity,
          host: network === "ic" ? "https://ic0.app" : "http://localhost:4943",
        },
      })
      console.log("Backend actor created")

      setAuthClient(client)
      setActor(backendActor)
      setIsAuthenticated(isAuth)

      if (isAuth) {
        const principalText = identity.getPrincipal().toText()
        console.log("User principal:", principalText)
        setPrincipal(principalText)
        await fetchNotes(backendActor)
        await fetchTokenData(backendActor)
        await checkIcrcLedgerConfig(backendActor)
      }
    } catch (error) {
      console.error("Error initializing auth:", error)
    } finally {
      setIsLoading(false)
      console.log("Auth initialization complete")
    }
  }

  const login = async () => {
    setIsLoading(true)
    await authClient.login({
      identityProvider: `${identityProvider}#authorize`,
      onSuccess: initAuth,
    })
  }

  const logout = async () => {
    setIsLoading(true)
    await authClient.logout()
    await initAuth()
  }

  const fetchNotes = async (backendActor = actor) => {
    if (!backendActor) return
    try {
      const result = await backendActor.get_notes()
      setNotes(result)
    } catch (e) {
      console.error("Error fetching notes:", e)
    }
  }

  // Token-related functions
  const fetchTokenData = async (backendActor = actor) => {
    if (!backendActor) return
    try {
      const userBalance = await backendActor.get_balance()
      setBalance(Number(userBalance))

      const history = await backendActor.get_transaction_history()
      setTransactionHistory(history)

      // Try to fetch ICRC balance if ledger is configured
      try {
        const icrcBal = await backendActor.get_icrc_balance()
        if ('Ok' in icrcBal) {
          setIcrcBalance(BigInt(icrcBal.Ok))

        }


      } catch (e) {
        console.log("ICRC balance not available:", e)
        setIcrcBalance(null)
      }
    } catch (e) {
      console.error("Error fetching token data:", e)
    }
  }

  const checkIcrcLedgerConfig = async (backendActor = actor) => {
    if (!backendActor) return
    try {
      const ledgerId = await backendActor.get_icrc_ledger_canister_id()
      if (ledgerId.length > 0) {
        setIcrcLedgerCanisterId(ledgerId[0].toText())
      }
    } catch (e) {
      console.log("No ICRC ledger configured")
    }
  }

  const configureIcrcLedger = async () => {
    if (!actor || !icrcLedgerCanisterId.trim()) {
      setTransferStatus("Please enter a valid canister ID")
      return
    }

    setIsLoading(true)
    setTransferStatus("")

    try {
      const ledgerPrincipal = Principal.fromText(icrcLedgerCanisterId.trim())
      const result = await actor.set_icrc_ledger_canister_id(ledgerPrincipal)

      if ('Ok' in result || result === undefined) {
        setTransferStatus("ICRC ledger configured successfully!")
        setShowLedgerConfig(false)
        await fetchTokenData()
      } else {
        setTransferStatus("Failed to configure ICRC ledger")
      }
    } catch (error) {
      console.error("Error configuring ICRC ledger:", error)
      setTransferStatus("Invalid canister ID format")
    }
    setIsLoading(false)
  }

  const transferTokens = async () => {
    if (!actor || !transferTo.trim() || !transferAmount.trim()) {
      setTransferStatus("Please fill in all fields")
      return
    }

    const amount = parseInt(transferAmount)
    if (isNaN(amount) || amount <= 0) {
      setTransferStatus("Please enter a valid amount")
      return
    }

    // Check balance based on transfer type
    const availableBalance = transferType === "icrc" ? icrcBalance : balance
    if (transferType === "icrc" && icrcBalance === null) {
      setTransferStatus("ICRC balance not available. Please configure ICRC ledger.")
      return
    }

    if (BigInt(amount) > availableBalance) {
      setTransferStatus("Insufficient balance")
      return
    }


    setIsLoading(true)
    setTransferStatus("")

    try {
      const toPrincipal = Principal.fromText(transferTo.trim())
      let result

      if (transferType === "icrc") {
        result = await actor.icrc_transfer(toPrincipal, BigInt(amount))
      } else {
        result = await actor.transfer(toPrincipal, BigInt(amount))
      }

      if ('Ok' in result || typeof result === 'string') {
        setTransferStatus(`${transferType.toUpperCase()} transfer successful!`)
        setTransferTo("")
        setTransferAmount("")
        setShowTransferForm(false)
        await fetchTokenData()
      } else if ('Err' in result) {
        const error = result.Err
        if ('InsufficientBalance' in error || 'InsufficientFunds' in error) {
          setTransferStatus("Insufficient balance")
        } else if ('Unauthorized' in error) {
          setTransferStatus("Unauthorized transfer")
        } else if ('InvalidReceiver' in error) {
          setTransferStatus("Invalid receiver principal")
        } else if ('GenericError' in error) {
          setTransferStatus(`Transfer failed: ${error.GenericError.message}`)
        } else {
          setTransferStatus("Transfer failed")
        }
      }
    } catch (error) {
      console.error("Error transferring tokens:", error)
      if (error.message.includes("Invalid principal")) {
        setTransferStatus("Invalid principal format")
      } else {
        setTransferStatus("Transfer failed: " + error.message)
      }
    }
    setIsLoading(false)
  }

  const formatTimestamp = (timestamp) => {
    const date = new Date(Number(timestamp) / 1000000) // Convert nanoseconds to milliseconds
    return date.toLocaleString()
  }

  const formatPrincipal = (principalStr) => {
    if (principalStr.length > 20) {
      return `${principalStr.slice(0, 10)}...${principalStr.slice(-6)}`
    }
    return principalStr
  }

  const addNote = async () => {
    if (!actor || !newNote.trim()) return
    setIsLoading(true)
    try {
      await actor.add_note(newNote.trim())
      setNewNote("")
      setShowAddNote(false)
      await fetchNotes()
    } catch (error) {
      console.error("Error adding note:", error)
    }
    setIsLoading(false)
  }

  const deleteNote = async (id) => {
    if (!actor) return
    setIsLoading(true)
    try {
      await actor.delete_note(id)
      await fetchNotes()
    } catch (error) {
      console.error("Error deleting note:", error)
    }
    setIsLoading(false)
  }

  const startEditing = (id, content) => {
    setEditingNoteId(id)
    setEditingContent(content)
  }

  const updateNote = async () => {
    if (!actor || editingNoteId === null) return
    setIsLoading(true)
    try {
      await actor.update_note(editingNoteId, editingContent)
      setEditingNoteId(null)
      setEditingContent("")
      await fetchNotes()
    } catch (error) {
      console.error("Error updating note:", error)
    }
    setIsLoading(false)
  }

  const searchNotes = async () => {
    if (!actor) return
    setIsLoading(true)
    try {
      if (!searchQuery.trim()) {
        await fetchNotes()
        setIsLoading(false)
        return
      }
      const result = await actor.search_notes(searchQuery.trim())
      setNotes(result)
    } catch (error) {
      console.error("Error searching notes:", error)
    }
    setIsLoading(false)
  }

  const formatDate = () => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  if (isLoading && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center relative overflow-hidden">
        <FloatingParticles />
        <div className="text-center z-10 relative">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-transparent border-t-purple-400 border-r-pink-400 mb-6 shadow-2xl"></div>
          <div className="space-y-2">
            <p className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent animate-pulse">
              Connecting to Internet Computer
            </p>
            <div className="flex justify-center space-x-1">
              <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white relative overflow-hidden">
      <FloatingParticles />

      {/* Animated background gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 via-pink-500/5 to-purple-500/5 animate-gradient-x"></div>

      {/* Glassmorphism grid pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fillOpacity='0.03'%3E%3Cpath d='M0 0h40v40H0V0zm20 20a10 10 0 1 1 0-20 10 10 0 0 1 0 20z'/%3E%3C/g%3E%3C/svg%3E")`,
        }}></div>
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-12 animate-fade-in-up">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-3xl mb-6 shadow-2xl animate-pulse-glow relative overflow-hidden">
            <span className="text-3xl relative z-10">📝</span>
          </div>
          <h1 className="text-6xl font-black bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent mb-4 animate-slide-up bg-300% animate-gradient-x">
            IC Notes
          </h1>
          <p className="text-purple-200 text-xl animate-slide-up mb-2" style={{ animationDelay: '0.1s' }}>
            Decentralized note-taking with ICRC token integration
          </p>
          <p className="text-purple-300 text-sm animate-slide-up backdrop-blur-sm bg-white/5 px-4 py-2 rounded-full inline-block border border-white/10" style={{ animationDelay: '0.2s' }}>
            {formatDate()}
          </p>
        </div>

        {!isAuthenticated ? (
          <div className="max-w-md mx-auto animate-slide-up" style={{ animationDelay: '0.3s' }}>
            <div className="backdrop-blur-xl bg-white/10 p-8 rounded-3xl shadow-2xl border border-white/20 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-pink-500/10"></div>
              <div className="text-center relative z-10">
                <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-2xl animate-pulse-glow">
                  <span className="text-2xl">🔒</span>
                </div>
                <h3 className="text-2xl font-bold mb-4 bg-gradient-to-r from-purple-200 to-pink-200 bg-clip-text text-transparent">
                  Secure Authentication
                </h3>
                <p className="text-purple-200 mb-8 leading-relaxed">
                  Login with your Internet Identity to access your private notes and tokens
                </p>
                <button
                  onClick={login}
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold py-4 px-8 rounded-2xl transition-all duration-500 transform hover:scale-105 shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none relative overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-pink-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                  <span className="relative z-10 flex items-center justify-center">
                    {isLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white mr-2"></div>
                        Connecting...
                      </>
                    ) : (
                      <>
                        <span className="mr-2">🔑</span>
                        Login with Internet Identity
                      </>
                    )}
                  </span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* User Info & Token Balance */}
            <div className="backdrop-blur-xl bg-white/10 p-6 rounded-2xl border border-white/20 animate-slide-up shadow-xl">
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-gradient-to-r from-green-400 to-emerald-500 rounded-2xl flex items-center justify-center shadow-xl animate-pulse-glow">
                    <span className="text-xl">👤</span>
                  </div>
                  <div>
                    <p className="text-sm text-purple-200 font-medium">Principal ID</p>
                    <p className="font-mono text-sm bg-black/30 px-3 py-1 rounded-xl border border-white/10 backdrop-blur-sm">
                      {principal.slice(0, 25)}...
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-6">
                  <div className="text-center">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-2xl">🪙</span>
                      <p className="text-sm text-purple-200 font-medium">Internal Balance</p>
                    </div>
                    <p className="text-xl font-bold bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent">
                      {balance.toLocaleString()}
                    </p>
                  </div>

                  {icrcBalance !== null && (
                    <div className="text-center">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="text-2xl">💎</span>
                        <p className="text-sm text-purple-200 font-medium">ICRC Balance</p>
                      </div>
                      <p className="text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                        {icrcBalance.toLocaleString()}
                      </p>
                    </div>
                  )}

                  <button
                    onClick={logout}
                    className="bg-gradient-to-r from-red-500/20 to-pink-500/20 hover:from-red-500/30 hover:to-pink-500/30 text-red-200 font-semibold py-3 px-6 rounded-xl transition-all duration-300 border border-red-400/30 hover:border-red-400/50 shadow-lg hover:shadow-xl backdrop-blur-sm"
                  >
                    <span className="inline-block mr-2">👋</span>
                    Logout
                  </button>
                </div>
              </div>
            </div>

            {/* Token Section Toggle */}
            <div className="flex justify-center gap-4 animate-slide-up" style={{ animationDelay: '0.1s' }}>
              <button
                onClick={() => setShowTokenSection(!showTokenSection)}
                className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-bold py-3 px-6 rounded-xl transition-all duration-300 shadow-lg relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-yellow-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <span className="relative z-10 flex items-center space-x-2">
                  <span>🪙</span>
                  <span>{showTokenSection ? 'Hide Tokens' : 'Show Tokens'}</span>
                </span>
              </button>
            </div>

            {/* Token Section */}
            {showTokenSection && (
              <div className="space-y-6 animate-slide-up">
                {/* ICRC Ledger Configuration */}
                {!icrcLedgerCanisterId && (
                  <div className="backdrop-blur-xl bg-white/10 p-6 rounded-2xl border border-white/20 shadow-xl">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl font-semibold bg-gradient-to-r from-blue-200 to-cyan-200 bg-clip-text text-transparent">
                        Configure ICRC Ledger
                      </h3>
                      <button
                        onClick={() => setShowLedgerConfig(!showLedgerConfig)}
                        className="bg-gradient-to-r from-blue-500/20 to-cyan-500/20 hover:from-blue-500/30 hover:to-cyan-500/30 text-blue-200 font-semibold py-2 px-4 rounded-xl transition-all duration-300 border border-blue-400/30"
                      >
                        {showLedgerConfig ? 'Cancel' : 'Configure'}
                      </button>
                    </div>

                    {showLedgerConfig && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-purple-200 text-sm font-medium mb-2">
                            ICRC Ledger Canister ID
                          </label>
                          <input
                            type="text"
                            placeholder="Enter ICRC ledger canister ID..."
                            className="w-full p-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all duration-300 backdrop-blur-sm"
                            value={icrcLedgerCanisterId}
                            onChange={(e) => setIcrcLedgerCanisterId(e.target.value)}
                          />
                          <p className="text-xs text-purple-300 mt-1">
                            Example: mxzaz-hqaaa-aaaar-qaada-cai
                          </p>
                        </div>

                        <button
                          onClick={configureIcrcLedger}
                          disabled={isLoading || !icrcLedgerCanisterId.trim()}
                          className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg relative overflow-hidden group"
                        >
                          <span className="relative z-10">
                            {isLoading ? 'Configuring...' : 'Set ICRC Ledger'}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Transfer Form */}
                <div className="backdrop-blur-xl bg-white/10 p-6 rounded-2xl border border-white/20 shadow-xl">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold bg-gradient-to-r from-yellow-200 to-orange-200 bg-clip-text text-transparent">
                      Transfer Tokens
                    </h3>
                    <button
                      onClick={() => setShowTransferForm(!showTransferForm)}
                      className="bg-gradient-to-r from-blue-500/20 to-cyan-500/20 hover:from-blue-500/30 hover:to-cyan-500/30 text-blue-200 font-semibold py-2 px-4 rounded-xl transition-all duration-300 border border-blue-400/30"
                    >
                      {showTransferForm ? 'Cancel' : 'Transfer'}
                    </button>
                  </div>

                  {showTransferForm && (
                    <div className="space-y-4">
                      {/* Transfer Type Selection */}
                      <div>
                        <label className="block text-purple-200 text-sm font-medium mb-2">
                          Transfer Type
                        </label>
                        <div className="flex gap-4">
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="radio"
                              value="internal"
                              checked={transferType === "internal"}
                              onChange={(e) => setTransferType(e.target.value)}
                              className="text-yellow-400 focus:ring-yellow-400"
                            />
                            <span className="text-purple-200">Internal Tokens</span>
                          </label>
                          {icrcBalance !== null && (
                            <label className="flex items-center space-x-2 cursor-pointer">
                              <input
                                type="radio"
                                value="icrc"
                                checked={transferType === "icrc"}
                                onChange={(e) => setTransferType(e.target.value)}
                                className="text-blue-400 focus:ring-blue-400"
                              />
                              <span className="text-purple-200">ICRC Tokens</span>
                            </label>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="block text-purple-200 text-sm font-medium mb-2">
                          Recipient Principal ID
                        </label>
                        <input
                          type="text"
                          placeholder="Enter principal ID..."
                          className="w-full p-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent transition-all duration-300 backdrop-blur-sm"
                          value={transferTo}
                          onChange={(e) => setTransferTo(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-purple-200 text-sm font-medium mb-2">
                          Amount (Available: {transferType === "icrc" ? icrcBalance : balance})
                        </label>
                        <input
                          type="number"
                          placeholder="Enter amount..."
                          className="w-full p-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent transition-all duration-300 backdrop-blur-sm"
                          value={transferAmount}
                          onChange={(e) => setTransferAmount(e.target.value)}
                          min="1"
                          max={transferType === "icrc" ? icrcBalance : balance}
                        />
                      </div>

                      {transferStatus && (
                        <div className={`p-3 rounded-xl text-sm font-medium ${transferStatus.includes('successful')
                          ? 'bg-green-500/20 text-green-200 border border-green-400/30'
                          : 'bg-red-500/20 text-red-200 border border-red-400/30'
                          }`}>
                          {transferStatus}
                        </div>
                      )}

                      <button
                        onClick={transferTokens}
                        disabled={isLoading || !transferTo.trim() || !transferAmount.trim()}
                        className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg relative overflow-hidden group"
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-yellow-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        <span className="relative z-10">
                          {isLoading ? 'Transferring...' : `Send ${transferType.toUpperCase()} Tokens`}
                        </span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Transaction History */}
                <div className="backdrop-blur-xl bg-white/10 p-6 rounded-2xl border border-white/20 shadow-xl">
                  <h3 className="text-xl font-semibold mb-4 bg-gradient-to-r from-purple-200 to-pink-200 bg-clip-text text-transparent">
                    Transaction History
                  </h3>

                  {transactionHistory.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <span className="text-2xl">📊</span>
                      </div>
                      <p className="text-purple-300">No transactions yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {transactionHistory.map((tx, index) => (
                        <div key={index} className="bg-white/5 p-4 rounded-xl border border-white/10">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center space-x-2">
                              <span className="text-lg">
                                {tx.sender === principal ? '📤' : '📥'}
                              </span>
                              <span className="font-medium">
                                {tx.sender === principal ? 'Sent' : 'Received'}
                              </span>
                              {tx.transaction_type && (
                                <span className={`text-xs px-2 py-1 rounded-full ${tx.transaction_type.ICRC ? 'bg-blue-500/20 text-blue-200' : 'bg-yellow-500/20 text-yellow-200'
                                  }`}>
                                  {tx.transaction_type.ICRC ? 'ICRC' : 'Internal'}
                                </span>
                              )}
                            </div>
                            <span className="text-yellow-400 font-bold">
                              {tx.amount.toString()} tokens
                            </span>
                          </div>
                          <div className="text-sm text-purple-200 space-y-1">
                            <p>
                              <span className="text-purple-300">From:</span> {formatPrincipal(tx.sender)}
                            </p>
                            <p>
                              <span className="text-purple-300">To:</span> {formatPrincipal(tx.receiver)}
                            </p>
                            <p>
                              <span className="text-purple-300">Date:</span> {formatTimestamp(tx.timestamp)}
                            </p>
                            {tx.block_index && (
                              <p>
                                <span className="text-purple-300">Block:</span> {tx.block_index.toString()}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Search Bar */}
            <div className="backdrop-blur-xl bg-white/10 p-6 rounded-2xl border border-white/20 animate-slide-up shadow-xl" style={{ animationDelay: '0.2s' }}>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 relative group">
                  <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-purple-300 text-lg group-focus-within:text-pink-400 transition-colors duration-300">🔍</span>
                  <input
                    type="text"
                    placeholder="Search your notes..."
                    className="w-full pl-12 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all duration-300 backdrop-blur-sm"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && searchNotes()}
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={searchNotes}
                    disabled={isLoading}
                    className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 hover:from-purple-500/30 hover:to-pink-500/30 text-purple-200 font-semibold py-3 px-6 rounded-xl transition-all duration-300 border border-purple-400/30 disabled:opacity-50 shadow-lg hover:shadow-xl backdrop-blur-sm"
                  >
                    <span className="inline-block mr-2">🔎</span>
                    Search
                  </button>
                  <button
                    onClick={() => {
                      setSearchQuery("")
                      fetchNotes()
                    }}
                    className="bg-gradient-to-r from-gray-500/20 to-slate-500/20 hover:from-gray-500/30 hover:to-slate-500/30 text-gray-200 font-semibold py-3 px-6 rounded-xl transition-all duration-300 border border-gray-400/30 shadow-lg hover:shadow-xl backdrop-blur-sm"
                  >
                    <span className="inline-block mr-2">🧹</span>
                    Clear
                  </button>
                </div>
              </div>
            </div>

            {/* Add Note Button */}
            <div className="flex justify-center animate-slide-up" style={{ animationDelay: '0.3s' }}>
              <button
                onClick={() => setShowAddNote(!showAddNote)}
                className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold py-4 px-8 rounded-2xl transition-all duration-500 transform hover:scale-105 shadow-2xl relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-teal-500 to-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <span className="relative z-10 flex items-center space-x-2">
                  <span className={`transition-transform duration-300 ${showAddNote ? 'rotate-45' : ''}`}>➕</span>
                  <span>{showAddNote ? 'Cancel' : 'Add New Note'}</span>
                </span>
              </button>
            </div>

            {/* Add Note Form */}
            {showAddNote && (
              <div className="backdrop-blur-xl bg-white/10 p-6 rounded-2xl border border-white/20 transform transition-all duration-500 animate-slide-up shadow-xl">
                <h3 className="text-xl font-semibold mb-4 bg-gradient-to-r from-purple-200 to-pink-200 bg-clip-text text-transparent">
                  Create New Note
                </h3>
                <textarea
                  className="w-full p-4 bg-white/10 border border-white/20 rounded-xl text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent resize-none transition-all duration-300 backdrop-blur-sm"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="What's on your mind?"
                  rows={4}
                />
                <div className="flex justify-end gap-3 mt-4">
                  <button
                    onClick={() => setShowAddNote(false)}
                    className="bg-gradient-to-r from-gray-500/20 to-slate-500/20 hover:from-gray-500/30 hover:to-slate-500/30 text-gray-200 font-semibold py-2 px-6 rounded-xl transition-all duration-300 border border-gray-400/30 backdrop-blur-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addNote}
                    disabled={isLoading || !newNote.trim()}
                    className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold py-2 px-6 rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg relative overflow-hidden group"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-teal-500 to-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <span className="relative z-10">
                      {isLoading ? 'Saving...' : 'Save Note'}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* Notes Grid */}
            <div className="animate-slide-up" style={{ animationDelay: '0.4s' }}>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold bg-gradient-to-r from-purple-200 to-pink-200 bg-clip-text text-transparent">
                  Your Notes
                </h3>
                <span className="text-purple-300 text-sm bg-gradient-to-r from-purple-500/20 to-pink-500/20 px-4 py-2 rounded-full border border-purple-400/30 backdrop-blur-sm">
                  {notes.length} {notes.length === 1 ? 'note' : 'notes'}
                </span>
              </div>

              {notes.length === 0 ? (
                <div className="text-center py-16 animate-fade-in">
                  <div className="w-20 h-20 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-purple-400/30 backdrop-blur-sm animate-pulse-glow">
                    <span className="text-4xl text-purple-300">📚</span>
                  </div>
                  <h3 className="text-xl font-semibold text-purple-200 mb-2">No notes yet</h3>
                  <p className="text-purple-300">Create your first note to get started!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {notes.map(([id, content], index) => (
                    <div
                      key={id.toString()}
                      className="backdrop-blur-xl bg-white/10 p-6 rounded-2xl border border-white/20 hover:bg-white/15 transition-all duration-500 transform hover:scale-[1.02] shadow-xl hover:shadow-2xl animate-slide-up group relative overflow-hidden"
                      style={{ animationDelay: `${0.1 * index}s` }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                      <div className="relative z-10">
                        {editingNoteId === id ? (
                          <div className="space-y-4">
                            <textarea
                              value={editingContent}
                              onChange={(e) => setEditingContent(e.target.value)}
                              className="w-full p-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none transition-all duration-300 backdrop-blur-sm"
                              rows={4}
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={updateNote}
                                disabled={isLoading}
                                className="flex-1 bg-gradient-to-r from-green-500/20 to-emerald-500/20 hover:from-green-500/30 hover:to-emerald-500/30 text-green-200 font-semibold py-2 px-4 rounded-xl transition-all duration-300 border border-green-400/30 disabled:opacity-50 backdrop-blur-sm"
                              >
                                <span className="inline-block mr-2">✅</span>
                                {isLoading ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                onClick={() => setEditingNoteId(null)}
                                className="flex-1 bg-gradient-to-r from-red-500/20 to-pink-500/20 hover:from-red-500/30 hover:to-pink-500/30 text-red-200 font-semibold py-2 px-4 rounded-xl transition-all duration-300 border border-red-400/30 backdrop-blur-sm"
                              >
                                <span className="inline-block mr-2">❌</span>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <p className="text-purple-100 whitespace-pre-line mb-6 leading-relaxed">
                              {content.length > 150 ? `${content.substring(0, 150)}...` : content}
                            </p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => startEditing(id, content)}
                                className="flex-1 bg-gradient-to-r from-yellow-500/20 to-amber-500/20 hover:from-yellow-500/30 hover:to-amber-500/30 text-yellow-200 font-semibold py-2 px-4 rounded-xl transition-all duration-300 border border-yellow-400/30 flex items-center justify-center space-x-2 shadow-lg hover:shadow-xl backdrop-blur-sm group"
                              >
                                <span className="inline-block mr-2 group-hover:scale-110 transition-transform duration-300">✏️</span>
                                <span>Edit</span>
                              </button>
                              <button
                                onClick={() => deleteNote(id)}
                                disabled={isLoading}
                                className="flex-1 bg-gradient-to-r from-red-500/20 to-pink-500/20 hover:from-red-500/30 hover:to-pink-500/30 text-red-200 font-semibold py-2 px-4 rounded-xl transition-all duration-300 border border-red-400/30 flex items-center justify-center space-x-2 disabled:opacity-50 shadow-lg hover:shadow-xl backdrop-blur-sm group"
                              >
                                <span className="inline-block mr-2 group-hover:scale-110 transition-transform duration-300">🗑️</span>
                                <span>{isLoading ? 'Deleting...' : 'Delete'}</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes gradient-x {
          0%, 100% {
            background-size: 200% 200%;
            background-position: left center;
          }
          50% {
            background-size: 200% 200%;
            background-position: right center;
          }
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(0px) rotate(0deg);
          }
          33% {
            transform: translateY(-10px) rotate(120deg);
          }
          66% {
            transform: translateY(5px) rotate(240deg);
          }
        }

        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes pulse-glow {
          0%, 100% {
            box-shadow: 0 0 20px rgba(168, 85, 247, 0.4);
          }
          50% {
            box-shadow: 0 0 30px rgba(236, 72, 153, 0.6);
          }
        }

        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }

        .animate-gradient-x {
          animation: gradient-x 15s ease infinite;
        }

        .animate-float {
          animation: float 6s ease-in-out infinite;
        }

        .animate-fade-in-up {
          animation: fade-in-up 0.6s ease-out;
        }

        .animate-slide-up {
          animation: slide-up 0.6s ease-out;
        }

        .animate-pulse-glow {
          animation: pulse-glow 2s ease-in-out infinite;
        }

        .animate-shimmer {
          animation: shimmer 2s ease-in-out infinite;
        }

        .bg-300% {
          background-size: 300% 300%;
        }
      `}</style>
    </div>
  )
}

export default App