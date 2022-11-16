// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '@openzeppelin/contracts/utils/introspection/IERC165.sol';
import './../structs/SNOWPayParamsData.sol';
import './../structs/SNOWRedeemParamsData.sol';
import './ISNOWFundingCycleStore.sol';
import './ISNOWPayDelegate.sol';
import './ISNOWRedemptionDelegate.sol';

/**
  @title
  Datasource

  @notice
  The datasource is called by SNOWPaymentTerminal on pay and redemption, and provide an extra layer of logic to use
  a custom weight, a custom memo and/or a pay/redeem delegate

  @dev
  Adheres to:
  IERC165 for adequate interface integration
*/
interface ISNOWFundingCycleDataSource is IERC165 {
  /**
    @notice
    The datasource implementation for SNOWPaymentTerminal.pay(..)

    @param _data the data passed to the data source in terminal.pay(..), as a SNOWPayParamsData struct:
                  ISNOWPaymentTerminal terminal;
                  address payer;
                  SNOWTokenAmount amount;
                  uint256 projectId;
                  uint256 currentFundingCycleConfiguration;
                  address beneficiary;
                  uint256 weight;
                  uint256 reservedRate;
                  string memo;
                  bytes metadata;

    @return weight the weight to use to override the funding cycle weight
    @return memo the memo to override the pay(..) memo
    @return delegate the address of the pay delegate (might or might not be the same contract)
  */
  function payParams(SNOWPayParamsData calldata _data)
    external
    returns (
      uint256 weight,
      string memory memo,
      ISNOWPayDelegate delegate
    );

  /**
    @notice
    The datasource implementation for SNOWPaymentTerminal.redeemTokensOf(..)

    @param _data the data passed to the data source in terminal.redeemTokensOf(..), as a SNOWRedeemParamsData struct:
                    ISNOWPaymentTerminal terminal;
                    address holder;
                    uint256 projectId;
                    uint256 currentFundingCycleConfiguration;
                    uint256 tokenCount;
                    uint256 totalSupply;
                    uint256 overflow;
                    SNOWTokenAmount reclaimAmount;
                    bool useTotalOverflow;
                    uint256 redemptionRate;
                    uint256 ballotRedemptionRate;
                    string memo;
                    bytes metadata;

    @return reclaimAmount the amount to claim, overriding the terminal logic
    @return memo the memo to override the redeemTokensOf(..) memo
    @return delegate the address of the redemption delegate (might or might not be the same contract)
  */
  function redeemParams(SNOWRedeemParamsData calldata _data)
    external
    returns (
      uint256 reclaimAmount,
      string memory memo,
      ISNOWRedemptionDelegate delegate
    );
}
