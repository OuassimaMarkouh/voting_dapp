// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract VotingSessions {
    struct VotingSession {
        address owner;
        string title;
        string[] proposals;
        mapping(address => bool) hasVoted;
        mapping(uint => uint) votes;
        mapping(address => uint) votedProposalIndex;
        bool isOpen;
        uint id;
        bool isSuperElectorVote; // Indique si c'est une élection de super-électeurs
    }

    struct SuperElector {
        bool isSuperElector;
        uint weight; // Poids du vote basé sur le nombre de votes reçus
        uint governanceTokens; // Tokens de gouvernance attribués
    }

    uint public sessionCount;
    uint public superElectorCount;

    mapping(uint => VotingSession) public sessions;
    mapping(address => SuperElector) public superElectors;
    mapping(address => bool) public normalElectors;

    event SessionCreated(uint sessionId, string title, bool isSuperElectorVote);
    event Voted(uint sessionId, address voter, uint proposalIndex);
    event SuperElectorElected(
        address superElector,
        uint weight,
        uint governanceTokens
    );

    /**
     * @dev Inscrit un électeur normal.
     */
    function registerNormalElector() public {
        require(
            !superElectors[msg.sender].isSuperElector,
            "Les super-electeurs ne peuvent pas s'inscrire comme normaux."
        );
        normalElectors[msg.sender] = true;
    }

    /**
     * @dev Crée une nouvelle session de vote.
     * @param _title Titre de la session.
     * @param _proposals Liste des propositions.
     * @param _isSuperElectorVote Si vrai, c'est une élection de super-électeurs.
     */
    function createSession(
        string memory _title,
        string[] memory _proposals,
        bool _isSuperElectorVote
    ) public {
        sessionCount++;

        VotingSession storage newSession = sessions[sessionCount];
        newSession.owner = msg.sender;
        newSession.id = sessionCount;
        newSession.isOpen = true;
        newSession.title = _title;
        newSession.isSuperElectorVote = _isSuperElectorVote;

        for (uint i = 0; i < _proposals.length; i++) {
            newSession.proposals.push(_proposals[i]);
        }

        emit SessionCreated(sessionCount, _title, _isSuperElectorVote);
    }

    /**
     * @dev Vote pour une proposition.
     * @param _sessionId Identifiant de la session.
     * @param _proposalIndex Index de la proposition.
     */
    function vote(uint _sessionId, uint _proposalIndex) public {
        VotingSession storage session = sessions[_sessionId];

        require(session.isOpen, "La session est close.");
        require(!session.hasVoted[msg.sender], "Vous avez deja vote.");
        require(
            _proposalIndex < session.proposals.length,
            "Index de proposition invalide."
        );

        // Vérifier si c'est une élection de super-électeurs
        if (session.isSuperElectorVote) {
            require(
                normalElectors[msg.sender],
                "Seuls les electeurs normaux peuvent voter pour les super-electeurs."
            );
        } else {
            require(
                superElectors[msg.sender].isSuperElector,
                "Seuls les super-electeurs peuvent voter."
            );
        }

        session.hasVoted[msg.sender] = true;
        session.votedProposalIndex[msg.sender] = _proposalIndex;
        session.votes[_proposalIndex] += session.isSuperElectorVote
            ? 1
            : superElectors[msg.sender].weight;

        emit Voted(_sessionId, msg.sender, _proposalIndex);
    }

    /**
     * @dev Ferme une session de vote et traite les résultats.
     * @param _sessionId Identifiant de la session.
     */
    function closeSession(uint _sessionId) public {
        VotingSession storage session = sessions[_sessionId];

        require(
            msg.sender == session.owner,
            "Seul le createur peut fermer la session."
        );
        session.isOpen = false;

        if (session.isSuperElectorVote) {
            _processSuperElectorElection(_sessionId);
        }
    }

    /**
     * @dev Traite l'élection des super-électeurs et leur attribue un poids de vote.
     * @param _sessionId Identifiant de la session.
     */
    function _processSuperElectorElection(uint _sessionId) internal {
        VotingSession storage session = sessions[_sessionId];

        for (uint i = 0; i < session.proposals.length; i++) {
            address candidate = parseAddress(session.proposals[i]);
            uint votesReceived = session.votes[i];

            if (votesReceived > 0) {
                superElectors[candidate] = SuperElector({
                    isSuperElector: true,
                    weight: votesReceived,
                    governanceTokens: votesReceived
                });

                superElectorCount++;

                emit SuperElectorElected(
                    candidate,
                    votesReceived,
                    votesReceived
                );
            }
        }
    }

    /**
     * @dev Retourne les informations d'une session.
     * @param _sessionId Identifiant de la session.
     */
    function getSessionInfo(
        uint _sessionId
    )
        public
        view
        returns (
            string memory title,
            bool isOpen,
            string[] memory proposals,
            bool isSuperElectorVote
        )
    {
        VotingSession storage session = sessions[_sessionId];
        return (
            session.title,
            session.isOpen,
            session.proposals,
            session.isSuperElectorVote
        );
    }

    /**
     * @dev Vérifie si une adresse est un super-électeur.
     * @param _elector Adresse de l'électeur.
     */
    function isSuperElector(
        address _elector
    ) public view returns (bool, uint, uint) {
        SuperElector storage se = superElectors[_elector];
        return (se.isSuperElector, se.weight, se.governanceTokens);
    }

    /**
     * @dev Convertit une chaîne de caractères en adresse Ethereum.
     * @param _a Chaîne de caractères représentant une adresse.
     */
    function parseAddress(string memory _a) internal pure returns (address) {
        bytes memory tmp = bytes(_a);
        uint160 addr = 0;
        uint160 factor = 1;

        for (uint i = tmp.length - 1; i >= 2; i--) {
            // Ignorer "0x" au début
            uint8 digit = uint8(tmp[i]);

            if (digit >= 48 && digit <= 57) {
                addr += (digit - 48) * factor;
            } else if (digit >= 65 && digit <= 70) {
                addr += (digit - 55) * factor;
            } else if (digit >= 97 && digit <= 102) {
                addr += (digit - 87) * factor;
            }

            factor *= 16;
        }

        return address(addr);
    }
}
