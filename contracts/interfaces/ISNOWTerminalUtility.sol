// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import './ISNOWDirectory.sol';

interface ISNOWPaymentTerminalUtility {
  function directory() external view returns (ISNOWDirectory);
}
