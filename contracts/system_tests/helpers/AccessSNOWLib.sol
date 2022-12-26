// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '../../libraries/SNOWCurrencies.sol';
import '../../libraries/SNOWConstants.sol';
import '../../libraries/SNOWTokens.sol';

contract AccessSNOWLib {
  function AVAX() external pure returns (uint256) {
    return SNOWCurrencies.AVAX;
  }

  function USD() external pure returns (uint256) {
    return SNOWCurrencies.USD;
  }

  function AVAXToken() external pure returns (address) {
    return SNOWTokens.AVAX ;
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
