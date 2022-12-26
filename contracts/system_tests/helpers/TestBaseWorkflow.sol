// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './hevm.sol';
import '../../../lib/ds-test/src/test.sol';

import '../../SNOWController.sol';
import '../../SNOWDirectory.sol';
import '../../SNOWETHPaymentTerminal.sol';
import '../../SNOWERC20PaymentTerminal.sol';
import '../../SNOWSingleTokenPaymentTerminalStore.sol';
import '../../SNOWFundingCycleStore.sol';
import '../../SNOWOperatorStore.sol';
import '../../SNOWPrices.sol';
import '../../SNOWProjects.sol';
import '../../SNOWSplitsStore.sol';
import '../../SNOWToken.sol';
import '../../SNOWTokenStore.sol';

import '../../structs/SNOWDidPayData.sol';
import '../../structs/SNOWDidRedeemData.sol';
import '../../structs/SNOWFee.sol';
import '../../structs/SNOWFundAccessConstraints.sol';
import '../../structs/SNOWFundingCycle.sol';
import '../../structs/SNOWFundingCycleData.sol';
import '../../structs/SNOWFundingCycleMetadata.sol';
import '../../structs/SNOWGroupedSplits.sol';
import '../../structs/SNOWOperatorData.sol';
import '../../structs/SNOWPayParamsData.sol';
import '../../structs/SNOWProjectMetadata.sol';
import '../../structs/SNOWRedeemParamsData.sol';
import '../../structs/SNOWSplit.sol';

import '../../interfaces/ISNOWPaymentTerminal.sol';
import '../../interfaces/ISNOWToken.sol';

import './AccessSNOWLib.sol';

import '@paulrberg/contracts/math/PRBMath.sol';

// Base contract for SnowCone system tests.
//
// Provides common functionality, such as deploying contracts on test setup.
contract TestBaseWorkflow is DSTest {
  //*********************************************************************//
  // --------------------- private stored properties ------------------- //
  //*********************************************************************//

  // Multisig address used for testing.
  address private _multisig = address(123);

  address private _beneficiary = address(69420);

  // EVM Cheat codes - test addresses via prank and startPrank in hevm
  Hevm public evm = Hevm(HEVM_ADDRESS);

  // SNOWOperatorStore
  SNOWOperatorStore private _snowOperatorStore;
  // SNOWProjects
  SNOWProjects private _snowProjects;
  // SNOWPrices
  SNOWPrices private _snowPrices;
  // SNOWDirectory
  SNOWDirectory private _snowDirectory;
  // SNOWFundingCycleStore
  SNOWFundingCycleStore private _snowFundingCycleStore;
  // SNOWToken
  SNOWToken private _snowToken;
  // SNOWTokenStore
  SNOWTokenStore private _snowTokenStore;
  // SNOWSplitsStore
  SNOWSplitsStore private _snowSplitsStore;
  // SNOWController
  SNOWController private _snowController;
  // SNOWETHPaymentTerminalStore
  SNOWSingleTokenPaymentTerminalStore private _snowPaymentTerminalStore;
  // SNOWETHPaymentTerminal
  SNOWETHPaymentTerminal private _snowETHPaymentTerminal;
  // SNOWERC20PaymentTerminal
  SNOWERC20PaymentTerminal private _snowERC20PaymentTerminal;
  // AccessSNOWLib
  AccessSNOWLib private _accessSNOWLib;

  //*********************************************************************//
  // ------------------------- internal views -------------------------- //
  //*********************************************************************//

  function multisig() internal view returns (address) {
    return _multisig;
  }

  function beneficiary() internal view returns (address) {
    return _beneficiary;
  }

  function snowOperatorStore() internal view returns (SNOWOperatorStore) {
    return _snowOperatorStore;
  }

  function snowProjects() internal view returns (SNOWProjects) {
    return _snowProjects;
  }

  function snowPrices() internal view returns (SNOWPrices) {
    return _snowPrices;
  }

  function snowDirectory() internal view returns (SNOWDirectory) {
    return _snowDirectory;
  }

  function snowFundingCycleStore() internal view returns (SNOWFundingCycleStore) {
    return _snowFundingCycleStore;
  }

  function snowTokenStore() internal view returns (SNOWTokenStore) {
    return _snowTokenStore;
  }

  function snowSplitsStore() internal view returns (SNOWSplitsStore) {
    return _snowSplitsStore;
  }

  function snowController() internal view returns (SNOWController) {
    return _snowController;
  }

  function snowPaymentTerminalStore() internal view returns (SNOWSingleTokenPaymentTerminalStore) {
    return _snowPaymentTerminalStore;
  }

  function snowETHPaymentTerminal() internal view returns (SNOWETHPaymentTerminal) {
    return _snowETHPaymentTerminal;
  }

  function snowERC20PaymentTerminal() internal view returns (SNOWERC20PaymentTerminal) {
    return _snowERC20PaymentTerminal;
  }

  function snowToken() internal view returns (SNOWToken) {
    return _snowToken;
  }

  function snowLibraries() internal view returns (AccessSNOWLib) {
    return _accessSNOWLib;
  }

  //*********************************************************************//
  // --------------------------- test setup ---------------------------- //
  //*********************************************************************//

  // Deploys and initializes contracts for testing.
  function setUp() public virtual {
    // Labels
    evm.label(_multisig, 'projectOwner');
    evm.label(_beneficiary, 'beneficiary');

    // SNOWOperatorStore
    _snowOperatorStore = new SNOWOperatorStore();
    evm.label(address(_snowOperatorStore), 'SNOWOperatorStore');

    // SNOWProjects
    _snowProjects = new SNOWProjects(_snowOperatorStore);
    evm.label(address(_snowProjects), 'SNOWProjects');

    // SNOWPrices
    _snowPrices = new SNOWPrices(_multisig);
    evm.label(address(_snowPrices), 'SNOWPrices');

    address contractAtNoncePlusOne = addressFrom(address(this), 5);

    // SNOWFundingCycleStore
    _snowFundingCycleStore = new SNOWFundingCycleStore(ISNOWDirectory(contractAtNoncePlusOne));
    evm.label(address(_snowFundingCycleStore), 'SNOWFundingCycleStore');

    // SNOWDirectory
    _snowDirectory = new SNOWDirectory(_snowOperatorStore, _snowProjects, _snowFundingCycleStore, _multisig);
    evm.label(address(_snowDirectory), 'SNOWDirectory');

    // SNOWTokenStore
    _snowTokenStore = new SNOWTokenStore(_snowOperatorStore, _snowProjects, _snowDirectory);
    evm.label(address(_snowTokenStore), 'SNOWTokenStore');

    // SNOWSplitsStore
    _snowSplitsStore = new SNOWSplitsStore(_snowOperatorStore, _snowProjects, _snowDirectory);
    evm.label(address(_snowSplitsStore), 'SNOWSplitsStore');

    // SNOWController
    _snowController = new SNOWController(
      _snowOperatorStore,
      _snowProjects,
      _snowDirectory,
      _snowFundingCycleStore,
      _snowTokenStore,
      _snowSplitsStore
    );
    evm.label(address(_snowController), 'SNOWController');

    evm.prank(_multisig);
    _snowDirectory.setIsAllowedToSetFirstController(address(_snowController), true);

    // SNOWETHPaymentTerminalStore
    _snowPaymentTerminalStore = new SNOWSingleTokenPaymentTerminalStore(
      _snowDirectory,
      _snowFundingCycleStore,
      _snowPrices
    );
    evm.label(address(_snowPaymentTerminalStore), 'SNOWSingleTokenPaymentTerminalStore');

    // AccessSNOWLib
    _accessSNOWLib = new AccessSNOWLib();

    // SNOWETHPaymentTerminal
    _snowETHPaymentTerminal = new SNOWETHPaymentTerminal(
      _accessSNOWLib.AVAX(),
      _snowOperatorStore,
      _snowProjects,
      _snowDirectory,
      _snowSplitsStore,
      _snowPrices,
      _snowPaymentTerminalStore,
      _multisig
    );
    evm.label(address(_snowETHPaymentTerminal), 'SNOWETHPaymentTerminal');

    evm.prank(_multisig);
    _snowToken = new SNOWToken('MyToken', 'MT');

    evm.prank(_multisig);
    _snowToken.mint(0, _multisig, 100 * 10**18);

    // SNOWERC20PaymentTerminal
    _snowERC20PaymentTerminal = new SNOWERC20PaymentTerminal(
      _snowToken,
      _accessSNOWLib.AVAX(), // currency
      _accessSNOWLib.AVAX(), // base weight currency
      1, // SNOWSplitsGroupe
      _snowOperatorStore,
      _snowProjects,
      _snowDirectory,
      _snowSplitsStore,
      _snowPrices,
      _snowPaymentTerminalStore,
      _multisig
    );
    evm.label(address(_snowERC20PaymentTerminal), 'SNOWERC20PaymentTerminal');
  }

  //https://ethereum.stackexchange.com/questions/24248/how-to-calculate-an-ethereum-contracts-address-during-its-creation-using-the-so
  function addressFrom(address _origin, uint256 _nonce) internal pure returns (address _address) {
    bytes memory data;
    if (_nonce == 0x00) data = abi.encodePacked(bytes1(0xd6), bytes1(0x94), _origin, bytes1(0x80));
    else if (_nonce <= 0x7f)
      data = abi.encodePacked(bytes1(0xd6), bytes1(0x94), _origin, uint8(_nonce));
    else if (_nonce <= 0xff)
      data = abi.encodePacked(bytes1(0xd7), bytes1(0x94), _origin, bytes1(0x81), uint8(_nonce));
    else if (_nonce <= 0xffff)
      data = abi.encodePacked(bytes1(0xd8), bytes1(0x94), _origin, bytes1(0x82), uint16(_nonce));
    else if (_nonce <= 0xffffff)
      data = abi.encodePacked(bytes1(0xd9), bytes1(0x94), _origin, bytes1(0x83), uint24(_nonce));
    else data = abi.encodePacked(bytes1(0xda), bytes1(0x94), _origin, bytes1(0x84), uint32(_nonce));
    bytes32 hash = keccak256(data);
    assembly {
      mstore(0, hash)
      _address := mload(0)
    }
  }
}
