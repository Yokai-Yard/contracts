// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import './../structs/SNOWFee.sol';
import './ISNOWAllowanceTerminal.sol';
import './ISNOWDirectory.sol';
import './ISNOWFeeGauge.sol';
import './ISNOWPayDelegate.sol';
import './ISNOWPaymentTerminal.sol';
import './ISNOWPayoutTerminal.sol';
import './ISNOWPrices.sol';
import './ISNOWProjects.sol';
import './ISNOWRedemptionDelegate.sol';
import './ISNOWRedemptionTerminal.sol';
import './ISNOWSingleTokenPaymentTerminal.sol';
import './ISNOWSingleTokenPaymentTerminalStore.sol';
import './ISNOWSplitsStore.sol';

interface ISNOWPayoutRedemptionPaymentTerminal is
  ISNOWPaymentTerminal,
  ISNOWPayoutTerminal,
  ISNOWAllowanceTerminal,
  ISNOWRedemptionTerminal
{
  event AddToBalance(
    uint256 indexed projectId,
    uint256 amount,
    uint256 refundedFees,
    string memo,
    bytes metadata,
    address caller
  );

  event Migrate(
    uint256 indexed projectId,
    ISNOWPaymentTerminal indexed to,
    uint256 amount,
    address caller
  );

  event DistributePayouts(
    uint256 indexed fundingCycleConfiguration,
    uint256 indexed fundingCycleNumber,
    uint256 indexed projectId,
    address beneficiary,
    uint256 amount,
    uint256 distributedAmount,
    uint256 fee,
    uint256 beneficiaryDistributionAmount,
    string memo,
    address caller
  );

  event UseAllowance(
    uint256 indexed fundingCycleConfiguration,
    uint256 indexed fundingCycleNumber,
    uint256 indexed projectId,
    address beneficiary,
    uint256 amount,
    uint256 distributedAmount,
    uint256 netDistributedamount,
    string memo,
    address caller
  );

  event HoldFee(
    uint256 indexed projectId,
    uint256 indexed amount,
    uint256 indexed fee,
    uint256 feeDiscount,
    address beneficiary,
    address caller
  );

  event ProcessFee(
    uint256 indexed projectId,
    uint256 indexed amount,
    bool indexed wasHeld,
    address beneficiary,
    address caller
  );

  event RefundHeldFees(
    uint256 indexed projectId,
    uint256 indexed amount,
    uint256 indexed refundedFees,
    uint256 leftoverAmount,
    address caller
  );

  event Pay(
    uint256 indexed fundingCycleConfiguration,
    uint256 indexed fundingCycleNumber,
    uint256 indexed projectId,
    address payer,
    address beneficiary,
    uint256 amount,
    uint256 beneficiaryTokenCount,
    string memo,
    bytes metadata,
    address caller
  );

  event DelegateDidPay(ISNOWPayDelegate indexed delegate, SNOWDidPayData data, address caller);

  event RedeemTokens(
    uint256 indexed fundingCycleConfiguration,
    uint256 indexed fundingCycleNumber,
    uint256 indexed projectId,
    address holder,
    address beneficiary,
    uint256 tokenCount,
    uint256 reclaimedAmount,
    string memo,
    bytes metadata,
    address caller
  );

  event DelegateDidRedeem(
    ISNOWRedemptionDelegate indexed delegate,
    SNOWDidRedeemData data,
    address caller
  );

  event DistributeToPayoutSplit(
    uint256 indexed projectId,
    uint256 indexed domain,
    uint256 indexed group,
    SNOWSplit split,
    uint256 amount,
    address caller
  );

  event SetFee(uint256 fee, address caller);

  event SetFeeGauge(ISNOWFeeGauge indexed feeGauge, address caller);

  event SetFeelessAddress(address indexed addrs, bool indexed flag, address caller);

  function projects() external view returns (ISNOWProjects);

  function splitsStore() external view returns (ISNOWSplitsStore);

  function directory() external view returns (ISNOWDirectory);

  function prices() external view returns (ISNOWPrices);

  function store() external view returns (ISNOWSingleTokenPaymentTerminalStore);

  function baseWeightCurrency() external view returns (uint256);

  function payoutSplitsGroup() external view returns (uint256);

  function heldFeesOf(uint256 _projectId) external view returns (SNOWFee[] memory);

  function fee() external view returns (uint256);

  function feeGauge() external view returns (ISNOWFeeGauge);

  function isFeelessAddress(address _contract) external view returns (bool);

  function migrate(uint256 _projectId, ISNOWPaymentTerminal _to) external returns (uint256 balance);

  function processFees(uint256 _projectId) external;

  function setFee(uint256 _fee) external;

  function setFeeGauge(ISNOWFeeGauge _feeGauge) external;

  function setFeelessAddress(address _contract, bool _flag) external;
}
