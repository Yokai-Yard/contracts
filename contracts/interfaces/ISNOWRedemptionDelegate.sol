// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '@openzeppelin/contracts/utils/introspection/IERC165.sol';
import './../structs/SNOWDidRedeemData.sol';

/**
  @title
  Redemption delegate

  @notice
  Delegate called after SNOWTerminal.redeemTokensOf(..) logic completion (if passed by the funding cycle datasource)

  @dev
  Adheres to:
  IERC165 for adequate interface integration
*/
interface ISNOWRedemptionDelegate is IERC165 {
  /**
    @notice
    This function is called by SNOWPaymentTerminal.redeemTokensOf(..), after the execution of its logic

    @dev
    Critical business logic should be protected by an appropriate access control
    
    @param _data the data passed by the terminal, as a SNOWDidRedeemData struct:
                address holder;
                uint256 projectId;
                uint256 currentFundingCycleConfiguration;
                uint256 projectTokenCount;
                SNOWTokenAmount reclaimedAmount;
                address payable beneficiary;
                string memo;
                bytes metadata;
  */
  function didRedeem(SNOWDidRedeemData calldata _data) external;
}
