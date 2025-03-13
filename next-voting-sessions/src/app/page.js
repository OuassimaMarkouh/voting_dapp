"use client";

import React, { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { BrowserProvider, Contract } from "ethers";
import { CONTRACT_ABI, CONTRACT_ADDRESS } from "@/config";

/** Spinner stylé */
function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center space-y-2">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent dark:border-slate-600"></div>
      <span className="text-sm text-slate-600 dark:text-slate-300">Chargement...</span>
    </div>
  );
}

export default function HomePage() {
  const [contract, setContract] = useState(null);
  const [account, setAccount] = useState("");
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);

  // États pour la création d’une session
  const [showModal, setShowModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newProposals, setNewProposals] = useState([]);
  const [currentProposal, setCurrentProposal] = useState("");

  // Filtres
  const [openFilter, setOpenFilter] = useState("all");
  const [votedFilter, setVotedFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  // État pour gérer les sessions “dépliées”
  const [expandedSessions, setExpandedSessions] = useState(new Set());

  // ------------------------------------------------------
  // 1) NOUVEAUX ÉTATS et FONCTION checkElectorStatus
  // ------------------------------------------------------
  const [isSuperElector, setIsSuperElector] = useState(false);
  const [governanceTokens, setGovernanceTokens] = useState("0");

  async function checkElectorStatus() {
    if (!contract) return;
    try {
      // On récupère isSuper, weight, tokens depuis la fonction isSuperElector(account).
      // Adaptez si nécessaire selon la signature réelle de votre contrat.
      const [isSuper, , tokens] = await contract.isSuperElector(account);
      setIsSuperElector(isSuper);
      setGovernanceTokens(tokens.toString());
    } catch (err) {
      console.error("Erreur lors de la vérification du statut :", err);
    }
  }

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    if (contract) {
      fetchSessions();
      // ------------------------------------------------------
      // Appel supplémentaire à checkElectorStatus
      // ------------------------------------------------------
      checkElectorStatus();
    }
  }, [contract]);

  async function init() {
    if (typeof window !== "undefined" && window.ethereum) {
      try {
        const [selectedAccount] = await window.ethereum.request({
          method: "eth_requestAccounts",
        });
        setAccount(selectedAccount);

        const provider = new BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const votingContract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
        setContract(votingContract);

        toast.success("Connexion réussie !");
      } catch (err) {
        console.error("Erreur lors de la connexion :", err);
        toast.error("Erreur lors de la connexion à MetaMask.");
      }
    } else {
      console.error("MetaMask non détecté ou window non disponible !");
      toast.error("MetaMask non détecté ou window non disponible !");
    }
  }

  async function fetchSessions() {
    if (!contract) return;
    try {
      setLoading(true);
      const allSessions = await contract.getAllSessions();
      const sortedSessions = [...allSessions].sort(
        (a, b) => parseInt(b[0]) - parseInt(a[0])
      );

      const sessionsWithVotes = await Promise.all(
        sortedSessions.map(async (s) => {
          const id = parseInt(s[0]);
          const owner = s[1];
          const title = s[2];
          const isOpen = s[3];
          const proposals = s[4];
          const hasVoted = s[5];
          const votedProposalIndex = s[6];

          const votesArray = [];
          for (let i = 0; i < proposals.length; i++) {
            const voteCountBN = await contract.getProposalVotes(id, i);
            votesArray.push(voteCountBN.toString());
          }

          return [
            id,
            owner,
            title,
            isOpen,
            proposals,
            hasVoted,
            votedProposalIndex,
            votesArray,
          ];
        })
      );

      setSessions(sessionsWithVotes);
    } catch (err) {
      console.error("Erreur lors de la récupération des sessions :", err);
      toast.error("Impossible de récupérer la liste des sessions.");
    } finally {
      setLoading(false);
    }
  }

  function getFilteredSessions() {
    return sessions.filter((session) => {
      const isOpen = session[3];
      const hasVoted = session[5];
      const title = session[2] || "";
      const proposals = session[4] || [];

      if (openFilter === "open" && !isOpen) return false;
      if (openFilter === "closed" && isOpen) return false;
      if (votedFilter === "voted" && !hasVoted) return false;
      if (votedFilter === "notVoted" && hasVoted) return false;

      if (searchTerm.trim() !== "") {
        const lowerSearch = searchTerm.toLowerCase();
        const lowerTitle = title.toLowerCase();
        const lowerProposals = proposals.map((p) => p.toLowerCase());
        const matchTitle = lowerTitle.includes(lowerSearch);
        const matchProposals = lowerProposals.some((p) =>
          p.includes(lowerSearch)
        );
        if (!matchTitle && !matchProposals) {
          return false;
        }
      }
      return true;
    });
  }

  // ------------------------------------------------------
  // 3) METTRE À JOUR createSession POUR PRENDRE EN COMPTE
  //    UN TROISIÈME PARAMÈTRE si nécessaire
  // ------------------------------------------------------
  async function createSession(title, proposals, isSuper = false) {
    if (!contract) return;
    try {
      // Ajustez ce call selon la signature réelle du contrat (createSession(...) vs createSession(..., bool))
      const tx = await contract.createSession(title, proposals, isSuper);
      toast("Création de la session en cours...", { icon: "⏳" });
      await tx.wait();
      toast.success("Session créée !");
      fetchSessions();
      closeModal();
    } catch (err) {
      console.error("Erreur lors de la création de session :", err);
      toast.error("Erreur lors de la création de la session.");
    }
  }

  async function closeSession(sessionId) {
    if (!contract) return;
    try {
      const tx = await contract.closeSession(sessionId);
      toast("Fermeture de la session en cours...", { icon: "⏳" });
      await tx.wait();
      toast.success("Session fermée !");
      fetchSessions();
    } catch (err) {
      console.error("Erreur lors de la fermeture de la session :", err);
      toast.error("Erreur lors de la fermeture de la session.");
    }
  }

  // ------------------------------------------------------
  // 2) et 3) MODIFIER voteOnProposal SELON DEMANDE
  // (Ici, la seule différence est l'icône ⏳ par ex.)
  // ------------------------------------------------------
  async function voteOnProposal(sessionId, proposalIndex) {
    if (!contract) return;
    try {
      const tx = await contract.vote(sessionId, proposalIndex);
      toast("Vote en cours...", { icon: "⏳" });
      await tx.wait();
      toast.success("Vote effectué !");
      fetchSessions();
    } catch (err) {
      console.error("Erreur lors du vote :", err);
      toast.error("Erreur lors du vote.");
    }
  }

  function openModal() {
    setShowModal(true);
  }
  function closeModal() {
    setShowModal(false);
    setCurrentProposal("");
    setNewProposals([]);
    setNewTitle("");
  }

  function addProposal() {
    const trimmed = currentProposal.trim();
    if (!trimmed) {
      toast.error("Veuillez saisir une proposition valide.");
      return;
    }
    setNewProposals([...newProposals, trimmed]);
    setCurrentProposal("");
  }
  function removeProposal(index) {
    const updated = [...newProposals];
    updated.splice(index, 1);
    setNewProposals(updated);
  }
  function handleModalSubmit(e) {
    e.preventDefault();
    if (!newTitle.trim()) {
      toast.error("Veuillez saisir un titre valide.");
      return;
    }
    if (newProposals.length === 0) {
      toast.error("Veuillez ajouter au moins une proposition.");
      return;
    }
    createSession(newTitle, newProposals, false);
  }

  function toggleExpand(sessionId) {
    setExpandedSessions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sessionId)) {
        newSet.delete(sessionId);
      } else {
        newSet.add(sessionId);
      }
      return newSet;
    });
  }

  const filteredSessions = getFilteredSessions();
  const sessionCount = filteredSessions.length;

  return (
    <div className={"flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950"}>
      {/* Header */}
      <header className="border-b bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between">
          <h1 className="font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Voting dApp
          </h1>
          <div className="flex flex-col items-end space-y-1 sm:flex-row sm:items-center sm:space-y-0 sm:space-x-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Connecté :{" "}
              <span className="font-mono text-slate-800 dark:text-slate-200">{account}</span>
            </p>

            {/* ------------------------------------------------------
                4) AJOUT : AFFICHER STATUT SUPER ÉLECTEUR OU NON
               ------------------------------------------------------ */}
            <p className="text-gray-700 dark:text-gray-300 text-sm">
              {isSuperElector
                ? `Vous êtes un Super-Électeur avec ${governanceTokens} token(s) de gouvernance.`
                : "Vous êtes un électeur normal."}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 p-4">
        {/* Actions */}
        <div className="mb-6 mt-2 flex flex-wrap gap-3">
          <button
            onClick={openModal}
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-slate-900 px-4 py-2 text-sm font-medium text-slate-50 shadow hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:bg-slate-800 dark:hover:bg-slate-700"
          >
            {/* Icon plus */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="mr-2 h-4 w-4"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nouvelle Session
          </button>

          <button
            onClick={fetchSessions}
            className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700"
          >
            Rafraîchir
          </button>

          {/* ------------------------------------------------------
              2) BOUTON POUR CRÉER UNE ÉLECTION DE SUPER-ÉLECTEURS
             ------------------------------------------------------ */}
          <button
            onClick={() =>
              createSession(
                "Élection des Super-Électeurs",
                ["Adresse1", "Adresse2"], 
                true // On passe true pour indiquer que c'est une élection "super électeurs"
              )
            }
            className="mb-4 px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700"
          >
            Créer une élection de Super-Électeurs
          </button>
        </div>

        {/* BARRE DE RECHERCHE */}
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
            Recherche :
          </label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher par titre ou proposition..."
            className="block w-full rounded-md border border-slate-300 bg-white py-2 px-3 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        {/* Filtres */}
        <div className="mb-4 flex flex-wrap gap-6">
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              Filtrer par statut :
            </p>
            <div className="flex space-x-2">
              <button
                onClick={() => setOpenFilter("all")}
                className={
                  "inline-flex items-center justify-center rounded-md border border-slate-200 px-3 py-1 text-sm font-medium shadow-sm focus:outline-none dark:border-slate-700 " +
                  (openFilter === "all"
                    ? "bg-slate-900 text-slate-50 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700"
                    : "bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800")
                }
              >
                Toutes
              </button>
              <button
                onClick={() => setOpenFilter("open")}
                className={
                  "inline-flex items-center justify-center rounded-md border border-slate-200 px-3 py-1 text-sm font-medium shadow-sm focus:outline-none dark:border-slate-700 " +
                  (openFilter === "open"
                    ? "bg-slate-900 text-slate-50 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700"
                    : "bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800")
                }
              >
                Ouvertes
              </button>
              <button
                onClick={() => setOpenFilter("closed")}
                className={
                  "inline-flex items-center justify-center rounded-md border border-slate-200 px-3 py-1 text-sm font-medium shadow-sm focus:outline-none dark:border-slate-700 " +
                  (openFilter === "closed"
                    ? "bg-slate-900 text-slate-50 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700"
                    : "bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800")
                }
              >
                Fermées
              </button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              Filtrer par vote :
            </p>
            <div className="flex space-x-2">
              <button
                onClick={() => setVotedFilter("all")}
                className={
                  "inline-flex items-center justify-center rounded-md border border-slate-200 px-3 py-1 text-sm font-medium shadow-sm focus:outline-none dark:border-slate-700 " +
                  (votedFilter === "all"
                    ? "bg-slate-900 text-slate-50 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700"
                    : "bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800")
                }
              >
                Tous
              </button>
              <button
                onClick={() => setVotedFilter("voted")}
                className={
                  "inline-flex items-center justify-center rounded-md border border-slate-200 px-3 py-1 text-sm font-medium shadow-sm focus:outline-none dark:border-slate-700 " +
                  (votedFilter === "voted"
                    ? "bg-slate-900 text-slate-50 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700"
                    : "bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800")
                }
              >
                Voté
              </button>
              <button
                onClick={() => setVotedFilter("notVoted")}
                className={
                  "inline-flex items-center justify-center rounded-md border border-slate-200 px-3 py-1 text-sm font-medium shadow-sm focus:outline-none dark:border-slate-700 " +
                  (votedFilter === "notVoted"
                    ? "bg-slate-900 text-slate-50 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700"
                    : "bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800")
                }
              >
                Pas Voté
              </button>
            </div>
          </div>
        </div>

        <div className="mb-4 text-sm text-slate-600 dark:text-slate-400">
          Sessions trouvées : <strong>{sessionCount}</strong>
        </div>

        {/* Liste sessions ou spinner */}
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : sessionCount === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Aucune session ne correspond à vos filtres ou à votre recherche.
          </p>
        ) : (
          <div className="space-y-4">
            {filteredSessions.map((session) => {
              const sessionId = session[0];
              const sessionOwner = session[1];
              const sessionTitle = session[2];
              const sessionIsOpen = session[3];
              const sessionProposals = session[4];
              const sessionHasVoted = session[5];
              const sessionVotedIndex = session[6];
              const sessionVotes = session[7];

              const isExpanded = expandedSessions.has(sessionId);

              return (
                <div
                  key={sessionId}
                  className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {sessionTitle}{" "}
                        <span className="ml-1 text-xs text-slate-500 dark:text-slate-400">
                          #{sessionId}
                        </span>
                      </h3>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Propriétaire : <span className="font-mono">{sessionOwner}</span>
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span
                        className={
                          "inline-block rounded-full px-2 py-0.5 text-xs font-medium " +
                          (sessionHasVoted
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200")
                        }
                      >
                        {sessionHasVoted ? "Voté" : "A voter"}
                      </span>
                      <span
                        className={
                          "inline-block rounded-full px-2 py-0.5 text-xs font-medium " +
                          (sessionIsOpen
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200")
                        }
                      >
                        {sessionIsOpen ? "Ouverte" : "Fermée"}
                      </span>

                      {/* Chevron */}
                      <button
                        onClick={() => toggleExpand(sessionId)}
                        className="flex h-8 w-8 items-center justify-center rounded hover:bg-slate-100 focus:outline-none dark:hover:bg-slate-800"
                        aria-label="Toggle session details"
                      >
                        {isExpanded ? (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={2}
                            stroke="currentColor"
                            className="h-4 w-4 text-slate-600 dark:text-slate-300"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        ) : (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={2}
                            stroke="currentColor"
                            className="h-4 w-4 text-slate-600 dark:text-slate-300"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  <div
                    className={`transition-all duration-300 ${
                      isExpanded ? "max-h-[1000px]" : "max-h-0"
                    } overflow-hidden`}
                  >
                    <div className="space-y-4 p-4">
                      {/* ------------------------------------------------------
                          5) NOUVEAU <p> INDICATION "Ouvert/Fermé" - "Super/Standard"
                         ------------------------------------------------------ */}
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {sessionIsOpen ? "Ouvert" : "Fermé"} -{" "}
                        {/*
                          NOTE : Ici, l'instruction disait d'utiliser session[5] 
                          pour distinguer Élection des Super-Électeurs / Vote Standard,
                          mais dans votre structure actuelle, session[5] est "hasVoted".
                          Si votre contrat stocke "isSuper" à un index différent,
                          adaptez la logique ici (ex: session[8], session.isSuper, etc.).
                        */}
                        {sessionHasVoted
                          ? "Élection des Super-Électeurs"
                          : "Vote Standard"}
                      </p>

                      <div>
                        <h4 className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                          Propositions
                        </h4>
                        {sessionProposals.length === 0 ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Aucune proposition.
                          </p>
                        ) : (
                          <ul className="space-y-2">
                            {sessionProposals.map((proposal, idx) => (
                              <li
                                key={idx}
                                className={`flex items-center justify-between rounded border border-slate-100 px-3 py-2 text-sm dark:border-slate-700 ${
                                  sessionVotedIndex == idx
                                    ? "bg-slate-50 dark:bg-slate-800"
                                    : "bg-white dark:bg-slate-900"
                                }`}
                              >
                                <span className="text-slate-800 dark:text-slate-100">
                                  {proposal}
                                </span>
                                {sessionIsOpen && !sessionHasVoted && (
                                  <button
                                    onClick={() => voteOnProposal(sessionId, idx)}
                                    className="inline-flex items-center justify-center rounded-md bg-indigo-500 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-600"
                                  >
                                    Voter
                                  </button>
                                )}
                                {(!sessionIsOpen ||
                                  (sessionOwner.toLowerCase() === account.toLowerCase() &&
                                    sessionHasVoted)) && (
                                  <span className="ml-3 text-xs text-slate-600 dark:text-slate-400">
                                    (Votes : {sessionVotes[idx]})
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {sessionHasVoted && sessionVotedIndex !== -1 && (
                        <div className="text-xs text-indigo-600 dark:text-indigo-400">
                          Vous avez voté pour :{" "}
                          <strong>{sessionProposals[sessionVotedIndex]}</strong>.
                        </div>
                      )}

                      {sessionIsOpen &&
                        sessionOwner.toLowerCase() === account.toLowerCase() && (
                          <button
                            onClick={() => closeSession(sessionId)}
                            className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                          >
                            Clore la session
                          </button>
                        )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="w-full max-w-md rounded-md bg-white p-6 shadow-lg dark:bg-slate-900">
            <h3 className="mb-4 text-base font-semibold text-slate-900 dark:text-slate-100">
              Créer une nouvelle session
            </h3>
            <form onSubmit={handleModalSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Titre de la session :
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="block w-full rounded-md border border-slate-300 bg-white py-2 px-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Nouvelle proposition :
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={currentProposal}
                    onChange={(e) => setCurrentProposal(e.target.value)}
                    className="block w-full rounded-md border border-slate-300 bg-white py-2 px-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={addProposal}
                    className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-slate-50 hover:bg-slate-800"
                  >
                    +
                  </button>
                </div>
              </div>
              {newProposals.length > 0 && (
                <div>
                  <h4 className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                    Propositions :
                  </h4>
                  <ul className="space-y-1">
                    {newProposals.map((proposal, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between rounded border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                      >
                        <span className="text-slate-800 dark:text-slate-100">
                          {proposal}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeProposal(i)}
                          className="text-xs font-medium text-red-500 hover:text-red-600"
                        >
                          Supprimer
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Valider
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="inline-flex items-center justify-center rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
