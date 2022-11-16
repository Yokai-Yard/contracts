// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import './../structs/SNOWProjectMetadata.sol';
import './ISNOWTokenUriResolver.sol';

interface ISNOWProjects is IERC721 {
  event Create(
    uint256 indexed projectId,
    address indexed owner,
    SNOWProjectMetadata metadata,
    address caller
  );

  event SetMetadata(uint256 indexed projectId, SNOWProjectMetadata metadata, address caller);

  event SetTokenUriResolver(ISNOWTokenUriResolver indexed resolver, address caller);

  function count() external view returns (uint256);

  function metadataContentOf(uint256 _projectId, uint256 _domain)
    external
    view
    returns (string memory);

  function tokenUriResolver() external view returns (ISNOWTokenUriResolver);

  function createFor(address _owner, SNOWProjectMetadata calldata _metadata)
    external
    returns (uint256 projectId);

  function setMetadataOf(uint256 _projectId, SNOWProjectMetadata calldata _metadata) external;

  function setTokenUriResolver(ISNOWTokenUriResolver _newResolver) external;
}
