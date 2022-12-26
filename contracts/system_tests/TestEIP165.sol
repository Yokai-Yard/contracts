// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './helpers/TestBaseWorkflow.sol';
import '../SNOWReconfigurationBufferBallot.sol';
import '../SNOWETHERC20SplitsPayer.sol';

contract TestEIP165 is TestBaseWorkflow {
  bytes4 constant notSupportedInterface = 0xffffffff;

  uint256 constant projectId = 2;
  uint256 constant splitsProjectID = 3;
  address payable constant splitsBeneficiary = payable(address(420));
  uint256 constant splitsDomain = 1;
  uint256 constant splitsGroup = 1;
  bool constant splitsPreferClaimedTokens = false;
  string constant splitsMemo = '';
  bytes constant splitsMetadata = '';
  bool constant splitsPreferAddToBalance = true;
  address constant splitsOwner = address(420);

  function testSNOWController() public {
    SNOWController controller = snowController();

    // Should support these interfaces
    assertTrue(controller.supportsInterface(type(IERC165).interfaceId));
    assertTrue(controller.supportsInterface(type(ISNOWController).interfaceId));
    assertTrue(controller.supportsInterface(type(ISNOWMigratable).interfaceId));
    assertTrue(controller.supportsInterface(type(ISNOWOperatable).interfaceId));

    // Make sure it doesn't always return true
    assertTrue(!controller.supportsInterface(notSupportedInterface));
  }

  function testSNOWERC20PaymentTerminal() public {
    SNOWERC20PaymentTerminal terminal = new SNOWERC20PaymentTerminal(
      snowToken(),
      snowLibraries().USD(), // currency
      snowLibraries().AVAX(), // base weight currency
      1, // SNOWSplitsGroupe
      snowOperatorStore(),
      snowProjects(),
      snowDirectory(),
      snowSplitsStore(),
      snowPrices(),
      snowPaymentTerminalStore(),
      multisig()
    );

    // Should support these interfaces
    assertTrue(terminal.supportsInterface(type(IERC165).interfaceId));
    assertTrue(terminal.supportsInterface(type(ISNOWPayoutRedemptionPaymentTerminal).interfaceId));
    assertTrue(terminal.supportsInterface(type(ISNOWPayoutTerminal).interfaceId));
    assertTrue(terminal.supportsInterface(type(ISNOWPaymentTerminal).interfaceId));
    assertTrue(terminal.supportsInterface(type(ISNOWAllowanceTerminal).interfaceId));
    assertTrue(terminal.supportsInterface(type(ISNOWRedemptionTerminal).interfaceId));
    assertTrue(terminal.supportsInterface(type(ISNOWSingleTokenPaymentTerminal).interfaceId));
    assertTrue(terminal.supportsInterface(type(ISNOWOperatable).interfaceId));

    // Make sure it doesn't always return true
    assertTrue(!terminal.supportsInterface(notSupportedInterface));
  }

  function testSNOWETHPaymentTerminal() public {
    SNOWETHPaymentTerminal terminal = snowETHPaymentTerminal();

    // Should support these interfaces
    assertTrue(terminal.supportsInterface(type(IERC165).interfaceId));
    assertTrue(terminal.supportsInterface(type(ISNOWPayoutRedemptionPaymentTerminal).interfaceId));
    assertTrue(terminal.supportsInterface(type(ISNOWPayoutTerminal).interfaceId));
    assertTrue(terminal.supportsInterface(type(ISNOWPaymentTerminal).interfaceId));
    assertTrue(terminal.supportsInterface(type(ISNOWAllowanceTerminal).interfaceId));
    assertTrue(terminal.supportsInterface(type(ISNOWRedemptionTerminal).interfaceId));
    assertTrue(terminal.supportsInterface(type(ISNOWSingleTokenPaymentTerminal).interfaceId));
    assertTrue(terminal.supportsInterface(type(ISNOWOperatable).interfaceId));

    // Make sure it doesn't always return true
    assertTrue(!terminal.supportsInterface(notSupportedInterface));
  }

  function testSNOWProjects() public {
    SNOWProjects projects = snowProjects();

    // Should support these interfaces
    assertTrue(projects.supportsInterface(type(IERC165).interfaceId));
    assertTrue(projects.supportsInterface(type(IERC721).interfaceId));
    assertTrue(projects.supportsInterface(type(IERC721Metadata).interfaceId));
    assertTrue(projects.supportsInterface(type(ISNOWProjects).interfaceId));
    assertTrue(projects.supportsInterface(type(ISNOWOperatable).interfaceId));

    // Make sure it doesn't always return true
    assertTrue(!projects.supportsInterface(notSupportedInterface));
  }

  function testSNOWReconfigurationBufferBallot() public {
    SNOWReconfigurationBufferBallot ballot = new SNOWReconfigurationBufferBallot(
      3000,
      snowFundingCycleStore()
    );

    // Should support these interfaces
    assertTrue(ballot.supportsInterface(type(IERC165).interfaceId));
    assertTrue(ballot.supportsInterface(type(ISNOWReconfigurationBufferBallot).interfaceId));
    assertTrue(ballot.supportsInterface(type(ISNOWFundingCycleBallot).interfaceId));

    // Make sure it doesn't always return true
    assertTrue(!ballot.supportsInterface(notSupportedInterface));
  }

  function testSNOWETHERC20SplitsPayer() public {
    SNOWETHERC20SplitsPayer splitsPayer = new SNOWETHERC20SplitsPayer(
      splitsProjectID,
      splitsDomain,
      splitsGroup,
      snowSplitsStore(),
      projectId,
      splitsBeneficiary,
      splitsPreferClaimedTokens,
      splitsMemo,
      splitsMetadata,
      splitsPreferAddToBalance,
      splitsOwner
    );

    // Should support these interfaces
    assertTrue(splitsPayer.supportsInterface(type(IERC165).interfaceId));
    assertTrue(splitsPayer.supportsInterface(type(ISNOWSplitsPayer).interfaceId));
    assertTrue(splitsPayer.supportsInterface(type(ISNOWProjectPayer).interfaceId));

    // Make sure it doesn't always return true
    assertTrue(!splitsPayer.supportsInterface(notSupportedInterface));
  }
}
