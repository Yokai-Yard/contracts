// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import './../interfaces/ISNOWFundingCycleDataSource.sol';

/** 
  @member allowSetTerminals A flag indicating if setting terminals should be allowed during this funding cycle.
  @member allowSetController A flag indicating if setting a new controller should be allowed during this funding cycle.
*/
struct SNOWGlobalFundingCycleMetadata {
  bool allowSetTerminals;
  bool allowSetController;
}
