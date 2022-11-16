// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import './ISNOWOperatorStore.sol';

interface ISNOWOperatable {
  function operatorStore() external view returns (ISNOWOperatorStore);
}
