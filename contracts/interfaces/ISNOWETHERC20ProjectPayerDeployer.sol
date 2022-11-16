// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import './ISNOWDirectory.sol';
import './ISNOWProjectPayer.sol';

interface ISNOWETHERC20ProjectPayerDeployer {
  event DeployProjectPayer(
    ISNOWProjectPayer indexed projectPayer,
    uint256 defaultProjectId,
    address defaultBeneficiary,
    bool defaultPreferClaimedTokens,
    string defaultMemo,
    bytes defaultMetadata,
    bool preferAddToBalance,
    ISNOWDirectory directory,
    address owner,
    address caller
  );

  function deployProjectPayer(
    uint256 _defaultProjectId,
    address payable _defaultBeneficiary,
    bool _defaultPreferClaimedTokens,
    string memory _defaultMemo,
    bytes memory _defaultMetadata,
    bool _preferAddToBalance,
    ISNOWDirectory _directory,
    address _owner
  ) external returns (ISNOWProjectPayer projectPayer);
}
