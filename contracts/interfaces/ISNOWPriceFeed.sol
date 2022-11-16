// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ISNOWPriceFeed {
  function currentPrice(uint256 _targetDecimals) external view returns (uint256);
}
