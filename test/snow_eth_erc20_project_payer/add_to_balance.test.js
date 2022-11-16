import { ethers } from 'hardhat';
import { expect } from 'chai';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import snowDirectory from '../../artifacts/contracts/SNOWDirectory.sol/SNOWDirectory.json';
import snowTerminal from '../../artifacts/contracts/abstract/SNOWPayoutRedemptionPaymentTerminal.sol/SNOWPayoutRedemptionPaymentTerminal.json';
import ierc20 from '../../artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json';
import errors from '../helpers/errors.json';

describe('SNOWETHERC20ProjectPayer::addToBalanceOf(...)', function () {
  const INITIAL_PROJECT_ID = 1;
  const INITIAL_BENEFICIARY = ethers.Wallet.createRandom().address;
  const INITIAL_PREFER_CLAIMED_TOKENS = false;
  const INITIAL_MEMO = 'hello world';
  const INITIAL_METADATA = [0x1];
  const INITIAL_PREFER_ADD_TO_BALANCE = false;
  const PROJECT_ID = 7;
  const AMOUNT = ethers.utils.parseEther('1.0');
  const BENEFICIARY = ethers.Wallet.createRandom().address;
  const PREFER_CLAIMED_TOKENS = true;
  const MIN_RETURNED_TOKENS = 1;
  const MEMO = 'hi world';
  const METADATA = '0x69';
  const DECIMALS = 1;
  let ethToken;

  this.beforeAll(async function () {
    let snowTokensFactory = await ethers.getContractFactory('SNOWTokens');
    let snowTokens = await snowTokensFactory.deploy();

    ethToken = await snowTokens.ETH();
  });

  async function setup() {
    let [deployer, owner, caller, ...addrs] = await ethers.getSigners();

    let mockJbDirectory = await deployMockContract(deployer, snowDirectory.abi);
    let mockJbTerminal = await deployMockContract(deployer, snowTerminal.abi);
    let mockToken = await deployMockContract(deployer, ierc20.abi);

    let snowProjectPayerFactory = await ethers.getContractFactory('SNOWETHERC20ProjectPayer');
    let snowProjectPayer = await snowProjectPayerFactory.deploy(
      INITIAL_PROJECT_ID,
      INITIAL_BENEFICIARY,
      INITIAL_PREFER_CLAIMED_TOKENS,
      INITIAL_MEMO,
      INITIAL_METADATA,
      INITIAL_PREFER_ADD_TO_BALANCE,
      mockJbDirectory.address,
      owner.address,
    );

    return {
      deployer,
      owner,
      caller,
      addrs,
      mockToken,
      mockJbDirectory,
      mockJbTerminal,
      snowProjectPayer,
    };
  }

  it(`Should add eth to balance of project ID`, async function () {
    const { snowProjectPayer, mockJbDirectory, mockJbTerminal } = await setup();

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(PROJECT_ID, ethToken)
      .returns(mockJbTerminal.address);

    // Eth payments should use 18 decimals.
    await mockJbTerminal.mock.decimalsForToken.withArgs(ethToken).returns(18);

    await mockJbTerminal.mock.addToBalanceOf
      .withArgs(PROJECT_ID, AMOUNT, ethToken, MEMO, METADATA)
      .returns();

    await expect(
      snowProjectPayer.addToBalanceOf(
        PROJECT_ID,
        ethToken,
        AMOUNT,
        DECIMALS, // Dropped if token == eth
        MEMO,
        METADATA,
        { value: AMOUNT },
      ),
    ).to.not.be.reverted;
  });

  it(`Should add an ERC20 to balance of project ID`, async function () {
    const { caller, mockToken, snowProjectPayer, mockJbDirectory, mockJbTerminal } = await setup();

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(PROJECT_ID, mockToken.address)
      .returns(mockJbTerminal.address);

    await mockJbTerminal.mock.decimalsForToken.withArgs(mockToken.address).returns(DECIMALS);

    await mockJbTerminal.mock.addToBalanceOf
      .withArgs(PROJECT_ID, AMOUNT, mockToken.address, MEMO, METADATA)
      .returns();

    await mockToken.mock.transferFrom
      .withArgs(caller.address, snowProjectPayer.address, AMOUNT)
      .returns(true);
    await mockToken.mock.approve.withArgs(mockJbTerminal.address, AMOUNT).returns(true);

    await expect(
      snowProjectPayer
        .connect(caller)
        .addToBalanceOf(PROJECT_ID, mockToken.address, AMOUNT, DECIMALS, MEMO, METADATA),
    ).to.be.not.reverted;
  });

  it(`Can't add to balance if terminal not found`, async function () {
    const { snowProjectPayer, mockJbDirectory } = await setup();

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(PROJECT_ID, ethToken)
      .returns(ethers.constants.AddressZero);

    await expect(
      snowProjectPayer.addToBalanceOf(PROJECT_ID, ethToken, AMOUNT, DECIMALS, MEMO, METADATA),
    ).to.be.revertedWith(errors.TERMINAL_NOT_FOUND);
  });

  it(`Can't add to balance if terminal uses different number of decimals`, async function () {
    const { snowProjectPayer, mockJbDirectory, mockJbTerminal } = await setup();

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(PROJECT_ID, ethToken)
      .returns(mockJbTerminal.address);

    await mockJbTerminal.mock.decimalsForToken.withArgs(ethToken).returns(10);

    await expect(
      snowProjectPayer.addToBalanceOf(PROJECT_ID, ethToken, AMOUNT, DECIMALS, MEMO, METADATA),
    ).to.be.revertedWith(errors.INCORRECT_DECIMAL_AMOUNT);
  });

  it(`Can't send value along with non-eth token`, async function () {
    const { snowProjectPayer, mockToken } = await setup();

    await expect(
      snowProjectPayer.addToBalanceOf(
        PROJECT_ID,
        mockToken.address,
        AMOUNT,
        DECIMALS,
        MEMO,
        METADATA,
        {
          value: AMOUNT,
        },
      ),
    ).to.be.revertedWith(errors.NO_MSG_VALUE_ALLOWED);
  });
});
