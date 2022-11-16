// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '../../libraries/SNOWCurrencies.sol';
import '../../libraries/SNOWConstants.sol';
import '../../libraries/SNOWTokens.sol';

contract AccessSNOWLib {
  function ETH() external pure returns (uint256) {
    return SNOWCurrencies.ETH;
  }

  function USD() external pure returns (uint256) {
    return SNOWCurrencies.USD;
  }

  function ETHToken() external pure returns (address) {
    return SNOWTokens.ETH;
  }

  function MAX_FEE() external pure returns (uint256) {
    return SNOWConstants.MAX_FEE;
  }

  function MAX_RESERVED_RATE() external pure returns (uint256) {
    return SNOWConstants.MAX_RESERVED_RATE;
  }

  function MAX_REDEMPTION_RATE() external pure returns (uint256) {
    return SNOWConstants.MAX_REDEMPTION_RATE;
  }

  function MAX_DISCOUNT_RATE() external pure returns (uint256) {
    return SNOWConstants.MAX_DISCOUNT_RATE;
  }

  function SPLITS_TOTAL_PERCENT() external pure returns (uint256) {
    return SNOWConstants.SPLITS_TOTAL_PERCENT;
  }

  function MAX_FEE_DISCOUNT() external pure returns (uint256) {
    return SNOWConstants.MAX_FEE_DISCOUNT;
  }
}
