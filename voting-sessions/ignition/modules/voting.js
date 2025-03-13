const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

const voting = buildModule("VotingModule", (m) => {
  const voteContract = m.contract("VotingSessions");
  return { voteContract };
});

module.exports = voting;
