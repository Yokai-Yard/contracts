// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import './ISNOWPriceFeed.sol';

interface ISNOWPrices {
  event AddFeed(uint256 indexed currency, uint256 indexed base, ISNOWPriceFeed feed);

  function feedFor(uint256 _currency, uint256 _base) external view returns (ISNOWPriceFeed);

  function priceFor(
    uint256 _currency,
    uint256 _base,
    uint256 _decimals
  ) external view returns (uint256);

  function addFeedFor(
    uint256 _currency,
    uint256 _base,
    ISNOWPriceFeed _priceFeed
  ) external;
}
