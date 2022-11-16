// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ISNOWTokenUriResolver {
  function getUri(uint256 _projectId) external view returns (string memory tokenUri);
}
