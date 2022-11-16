// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import './../structs/SNOWGroupedSplits.sol';
import './../structs/SNOWSplit.sol';
import './ISNOWDirectory.sol';
import './ISNOWProjects.sol';

interface ISNOWSplitsStore {
  event SetSplit(
    uint256 indexed projectId,
    uint256 indexed domain,
    uint256 indexed group,
    SNOWSplit split,
    address caller
  );

  function projects() external view returns (ISNOWProjects);

  function directory() external view returns (ISNOWDirectory);

  function splitsOf(
    uint256 _projectId,
    uint256 _domain,
    uint256 _group
  ) external view returns (SNOWSplit[] memory);

  function set(
    uint256 _projectId,
    uint256 _domain,
    SNOWGroupedSplits[] memory _groupedSplits
  ) external;
}
