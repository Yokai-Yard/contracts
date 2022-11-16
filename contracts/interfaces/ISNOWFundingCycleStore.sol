// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import './../enums/SNOWBallotState.sol';
import './../structs/SNOWFundingCycle.sol';
import './../structs/SNOWFundingCycleData.sol';

interface ISNOWFundingCycleStore {
  event Configure(
    uint256 indexed configuration,
    uint256 indexed projectId,
    SNOWFundingCycleData data,
    uint256 metadata,
    uint256 mustStartAtOrAfter,
    address caller
  );

  event Init(uint256 indexed configuration, uint256 indexed projectId, uint256 indexed basedOn);

  function latestConfigurationOf(uint256 _projectId) external view returns (uint256);

  function get(uint256 _projectId, uint256 _configuration)
    external
    view
    returns (SNOWFundingCycle memory);

  function latestConfiguredOf(uint256 _projectId)
    external
    view
    returns (SNOWFundingCycle memory fundingCycle, SNOWBallotState ballotState);

  function queuedOf(uint256 _projectId) external view returns (SNOWFundingCycle memory fundingCycle);

  function currentOf(uint256 _projectId) external view returns (SNOWFundingCycle memory fundingCycle);

  function currentBallotStateOf(uint256 _projectId) external view returns (SNOWBallotState);

  function configureFor(
    uint256 _projectId,
    SNOWFundingCycleData calldata _data,
    uint256 _metadata,
    uint256 _mustStartAtOrAfter
  ) external returns (SNOWFundingCycle memory fundingCycle);
}
