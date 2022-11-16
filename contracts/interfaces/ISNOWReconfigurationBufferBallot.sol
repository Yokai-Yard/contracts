// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import './ISNOWFundingCycleBallot.sol';

interface ISNOWReconfigurationBufferBallot is ISNOWFundingCycleBallot {
  event Finalize(
    uint256 indexed projectId,
    uint256 indexed configuration,
    SNOWBallotState indexed ballotState,
    address caller
  );

  function finalState(uint256 _projectId, uint256 _configuration)
    external
    view
    returns (SNOWBallotState);

  function fundingCycleStore() external view returns (ISNOWFundingCycleStore);

  function finalize(uint256 _projectId, uint256 _configured) external returns (SNOWBallotState);
}
