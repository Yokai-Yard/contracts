// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './../interfaces/ISNOWControllerUtility.sol';

/** 
  @notice
  Provides tools for contracts with functionality that can only be accessed by a project's controller.

  @dev
  Adheres to -
  ISNOWControllerUtility: General interface for the methods in this contract that interact with the blockchain's state according to the protocol's rules.
*/
abstract contract SNOWControllerUtility is ISNOWControllerUtility {
  //*********************************************************************//
  // --------------------------- custom errors -------------------------- //
  //*********************************************************************//
  error CONTROLLER_UNAUTHORIZED();

  //*********************************************************************//
  // ---------------------------- modifiers ---------------------------- //
  //*********************************************************************//

  /** 
    @notice
    Only allows the controller of the specified project to proceed. 

    @param _projectId The ID of the project. 
  */
  modifier onlyController(uint256 _projectId) {
    if (address(directory.controllerOf(_projectId)) != msg.sender) revert CONTROLLER_UNAUTHORIZED();
    _;
  }

  //*********************************************************************//
  // ---------------- public immutable stored properties --------------- //
  //*********************************************************************//

  /** 
    @notice 
    The directory of terminals and controllers for projects.
  */
  ISNOWDirectory public immutable override directory;

  //*********************************************************************//
  // -------------------------- constructor ---------------------------- //
  //*********************************************************************//

  /** 
    @param _directory A contract storing directories of terminals and controllers for each project.
  */
  constructor(ISNOWDirectory _directory) {
    directory = _directory;
  }
}
