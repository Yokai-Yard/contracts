// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import './ISNOWFundingCycleStore.sol';
import './ISNOWPaymentTerminal.sol';
import './ISNOWProjects.sol';

interface ISNOWDirectory {
  event SetController(uint256 indexed projectId, address indexed controller, address caller);

  event AddTerminal(uint256 indexed projectId, ISNOWPaymentTerminal indexed terminal, address caller);

  event SetTerminals(uint256 indexed projectId, ISNOWPaymentTerminal[] terminals, address caller);

  event SetPrimaryTerminal(
    uint256 indexed projectId,
    address indexed token,
    ISNOWPaymentTerminal indexed terminal,
    address caller
  );

  event SetIsAllowedToSetFirstController(address indexed addr, bool indexed flag, address caller);

  function projects() external view returns (ISNOWProjects);

  function fundingCycleStore() external view returns (ISNOWFundingCycleStore);

  function controllerOf(uint256 _projectId) external view returns (address);

  function isAllowedToSetFirstController(address _address) external view returns (bool);

  function terminalsOf(uint256 _projectId) external view returns (ISNOWPaymentTerminal[] memory);

  function isTerminalOf(uint256 _projectId, ISNOWPaymentTerminal _terminal)
    external
    view
    returns (bool);

  function primaryTerminalOf(uint256 _projectId, address _token)
    external
    view
    returns (ISNOWPaymentTerminal);

  function setControllerOf(uint256 _projectId, address _controller) external;

  function setTerminalsOf(uint256 _projectId, ISNOWPaymentTerminal[] calldata _terminals) external;

  function setPrimaryTerminalOf(
    uint256 _projectId,
    address _token,
    ISNOWPaymentTerminal _terminal
  ) external;

  function setIsAllowedToSetFirstController(address _address, bool _flag) external;
}
