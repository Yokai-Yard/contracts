// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import './../structs/SNOWFundingCycle.sol';
import './../structs/SNOWTokenAmount.sol';
import './ISNOWDirectory.sol';
import './ISNOWFundingCycleStore.sol';
import './ISNOWPayDelegate.sol';
import './ISNOWPrices.sol';
import './ISNOWRedemptionDelegate.sol';
import './ISNOWSingleTokenPaymentTerminal.sol';

interface ISNOWSingleTokenPaymentTerminalStore {
  function fundingCycleStore() external view returns (ISNOWFundingCycleStore);

  function directory() external view returns (ISNOWDirectory);

  function prices() external view returns (ISNOWPrices);

  function balanceOf(ISNOWSingleTokenPaymentTerminal _terminal, uint256 _projectId)
    external
    view
    returns (uint256);

  function usedDistributionLimitOf(
    ISNOWSingleTokenPaymentTerminal _terminal,
    uint256 _projectId,
    uint256 _fundingCycleNumber
  ) external view returns (uint256);

  function usedOverflowAllowanceOf(
    ISNOWSingleTokenPaymentTerminal _terminal,
    uint256 _projectId,
    uint256 _fundingCycleConfiguration
  ) external view returns (uint256);

  function currentOverflowOf(ISNOWSingleTokenPaymentTerminal _terminal, uint256 _projectId)
    external
    view
    returns (uint256);

  function currentTotalOverflowOf(
    uint256 _projectId,
    uint256 _decimals,
    uint256 _currency
  ) external view returns (uint256);

  function currentReclaimableOverflowOf(
    ISNOWSingleTokenPaymentTerminal _terminal,
    uint256 _projectId,
    uint256 _tokenCount,
    bool _useTotalOverflow
  ) external view returns (uint256);

  function currentReclaimableOverflowOf(
    uint256 _projectId,
    uint256 _tokenCount,
    uint256 _totalSupply,
    uint256 _overflow
  ) external view returns (uint256);

  function recordPaymentFrom(
    address _payer,
    SNOWTokenAmount memory _amount,
    uint256 _projectId,
    uint256 _baseWeightCurrency,
    address _beneficiary,
    string calldata _memo,
    bytes calldata _metadata
  )
    external
    returns (
      SNOWFundingCycle memory fundingCycle,
      uint256 tokenCount,
      ISNOWPayDelegate delegate,
      string memory memo
    );

  function recordRedemptionFor(
    address _holder,
    uint256 _projectId,
    uint256 _tokenCount,
    string calldata _memo,
    bytes calldata _metadata
  )
    external
    returns (
      SNOWFundingCycle memory fundingCycle,
      uint256 reclaimAmount,
      ISNOWRedemptionDelegate delegate,
      string memory memo
    );

  function recordDistributionFor(
    uint256 _projectId,
    uint256 _amount,
    uint256 _currency
  ) external returns (SNOWFundingCycle memory fundingCycle, uint256 distributedAmount);

  function recordUsedAllowanceOf(
    uint256 _projectId,
    uint256 _amount,
    uint256 _currency
  ) external returns (SNOWFundingCycle memory fundingCycle, uint256 withdrawnAmount);

  function recordAddedBalanceFor(uint256 _projectId, uint256 _amount) external;

  function recordMigration(uint256 _projectId) external returns (uint256 balance);
}
