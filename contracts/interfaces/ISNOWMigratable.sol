// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ISNOWMigratable {
  function prepForMigrationOf(uint256 _projectId, address _from) external;
}
