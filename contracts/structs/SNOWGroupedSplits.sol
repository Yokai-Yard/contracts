// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import './SNOWSplit.sol';

/** 
  @member group The group indentifier.
  @member splits The splits to associate with the group.
*/
struct SNOWGroupedSplits {
  uint256 group;
  SNOWSplit[] splits;
}
