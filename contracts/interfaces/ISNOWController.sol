// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '@openzeppelin/contracts/utils/introspection/IERC165.sol';
import './../structs/SNOWFundAccessConstraints.sol';
import './../structs/SNOWFundingCycleData.sol';
import './../structs/SNOWFundingCycleMetadata.sol';
import './../structs/SNOWGroupedSplits.sol';
import './../structs/SNOWProjectMetadata.sol';
import './ISNOWDirectory.sol';
import './ISNOWFundingCycleStore.sol';
import './ISNOWMigratable.sol';
import './ISNOWPaymentTerminal.sol';
import './ISNOWSplitsStore.sol';
import './ISNOWToken.sol';
import './ISNOWTokenStore.sol';

interface ISNOWController is IERC165 {
  event LaunchProject(uint256 configuration, uint256 projectId, string memo, address caller);

  event LaunchFundingCycles(uint256 configuration, uint256 projectId, string memo, address caller);

  event ReconfigureFundingCycles(
    uint256 configuration,
    uint256 projectId,
    string memo,
    address caller
  );

  event SetFundAccessConstraints(
    uint256 indexed fundingCycleConfiguration,
    uint256 indexed fundingCycleNumber,
    uint256 indexed projectId,
    SNOWFundAccessConstraints constraints,
    address caller
  );

  event DistributeReservedTokens(
    uint256 indexed fundingCycleConfiguration,
    uint256 indexed fundingCycleNumber,
    uint256 indexed projectId,
    address beneficiary,
    uint256 tokenCount,
    uint256 beneficiaryTokenCount,
    string memo,
    address caller
  );

  event DistributeToReservedTokenSplit(
    uint256 indexed projectId,
    uint256 indexed domain,
    uint256 indexed group,
    SNOWSplit split,
    uint256 tokenCount,
    address caller
  );

  event MintTokens(
    address indexed beneficiary,
    uint256 indexed projectId,
    uint256 tokenCount,
    uint256 beneficiaryTokenCount,
    string memo,
    uint256 reservedRate,
    address caller
  );

  event BurnTokens(
    address indexed holder,
    uint256 indexed projectId,
    uint256 tokenCount,
    string memo,
    address caller
  );

  event Migrate(uint256 indexed projectId, ISNOWMigratable to, address caller);

  event PrepMigration(uint256 indexed projectId, address from, address caller);

  function projects() external view returns (ISNOWProjects);

  function fundingCycleStore() external view returns (ISNOWFundingCycleStore);

  function tokenStore() external view returns (ISNOWTokenStore);

  function splitsStore() external view returns (ISNOWSplitsStore);

  function directory() external view returns (ISNOWDirectory);

  function reservedTokenBalanceOf(uint256 _projectId, uint256 _reservedRate)
    external
    view
    returns (uint256);

  function distributionLimitOf(
    uint256 _projectId,
    uint256 _configuration,
    ISNOWPaymentTerminal _terminal,
    address _token
  ) external view returns (uint256 distributionLimit, uint256 distributionLimitCurrency);

  function overflowAllowanceOf(
    uint256 _projectId,
    uint256 _configuration,
    ISNOWPaymentTerminal _terminal,
    address _token
  ) external view returns (uint256 overflowAllowance, uint256 overflowAllowanceCurrency);

  function totalOutstandingTokensOf(uint256 _projectId, uint256 _reservedRate)
    external
    view
    returns (uint256);

  function getFundingCycleOf(uint256 _projectId, uint256 _configuration)
    external
    view
    returns (SNOWFundingCycle memory fundingCycle, SNOWFundingCycleMetadata memory metadata);

  function latestConfiguredFundingCycleOf(uint256 _projectId)
    external
    view
    returns (
      SNOWFundingCycle memory,
      SNOWFundingCycleMetadata memory metadata,
      SNOWBallotState
    );

  function currentFundingCycleOf(uint256 _projectId)
    external
    view
    returns (SNOWFundingCycle memory fundingCycle, SNOWFundingCycleMetadata memory metadata);

  function queuedFundingCycleOf(uint256 _projectId)
    external
    view
    returns (SNOWFundingCycle memory fundingCycle, SNOWFundingCycleMetadata memory metadata);

  function launchProjectFor(
    address _owner,
    SNOWProjectMetadata calldata _projectMetadata,
    SNOWFundingCycleData calldata _data,
    SNOWFundingCycleMetadata calldata _metadata,
    uint256 _mustStartAtOrAfter,
    SNOWGroupedSplits[] memory _groupedSplits,
    SNOWFundAccessConstraints[] memory _fundAccessConstraints,
    ISNOWPaymentTerminal[] memory _terminals,
    string calldata _memo
  ) external returns (uint256 projectId);

  function launchFundingCyclesFor(
    uint256 _projectId,
    SNOWFundingCycleData calldata _data,
    SNOWFundingCycleMetadata calldata _metadata,
    uint256 _mustStartAtOrAfter,
    SNOWGroupedSplits[] memory _groupedSplits,
    SNOWFundAccessConstraints[] memory _fundAccessConstraints,
    ISNOWPaymentTerminal[] memory _terminals,
    string calldata _memo
  ) external returns (uint256 configuration);

  function reconfigureFundingCyclesOf(
    uint256 _projectId,
    SNOWFundingCycleData calldata _data,
    SNOWFundingCycleMetadata calldata _metadata,
    uint256 _mustStartAtOrAfter,
    SNOWGroupedSplits[] memory _groupedSplits,
    SNOWFundAccessConstraints[] memory _fundAccessConstraints,
    string calldata _memo
  ) external returns (uint256);

  function issueTokenFor(
    uint256 _projectId,
    string calldata _name,
    string calldata _symbol
  ) external returns (ISNOWToken token);

  function changeTokenOf(
    uint256 _projectId,
    ISNOWToken _token,
    address _newOwner
  ) external;

  function mintTokensOf(
    uint256 _projectId,
    uint256 _tokenCount,
    address _beneficiary,
    string calldata _memo,
    bool _preferClaimedTokens,
    bool _useReservedRate
  ) external returns (uint256 beneficiaryTokenCount);

  function burnTokensOf(
    address _holder,
    uint256 _projectId,
    uint256 _tokenCount,
    string calldata _memo,
    bool _preferClaimedTokens
  ) external;

  function distributeReservedTokensOf(uint256 _projectId, string memory _memo)
    external
    returns (uint256);

  function migrate(uint256 _projectId, ISNOWMigratable _to) external;
}
