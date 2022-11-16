// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import './ISNOWPaymentTerminal.sol';

interface ISNOWSingleTokenPaymentTerminal is ISNOWPaymentTerminal {
  function token() external view returns (address);

  function currency() external view returns (uint256);

  function decimals() external view returns (uint256);
}
