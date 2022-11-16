import { ethers } from 'hardhat';
import { expect } from 'chai';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import snowDirectory from '../../artifacts/contracts/SNOWDirectory.sol/SNOWDirectory.json';
import snowTerminal from '../../artifacts/contracts/abstract/SNOWPayoutRedemptionPaymentTerminal.sol/SNOWPayoutRedemptionPaymentTerminal.json';
import snowToken from '../../artifacts/contracts/SNOWToken.sol/SNOWToken.json';
import errors from '../helpers/errors.json';

describe('SNOWETHERC20ProjectPayer::pay(...)', function () {
  const INITIAL_PROJECT_ID = 1;
  const INITIAL_BENEFICIARY = ethers.Wallet.createRandom().address;
  const INITIAL_PREFER_CLAIMED_TOKENS = false;
  const INITIAL_MEMO = 'hello world';
  const INITIAL_METADATA = '0x69';
  const INITIAL_PREFER_ADD_TO_BALANCE = false;
  const PROJECT_ID = 7;
  const AMOUNT = ethers.utils.parseEther('1.0');
  const BENEFICIARY = ethers.Wallet.createRandom().address;
  const PREFER_CLAIMED_TOKENS = true;
  const MIN_RETURNED_TOKENS = 1;
  const MEMO = 'hi world';
  const METADATA = '0x42';
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
    let mockJbToken = await deployMockContract(deployer, snowToken.abi);

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
      mockJbToken,
      mockJbDirectory,
      mockJbTerminal,
      snowProjectPayer,
    };
  }

  it(`Should pay funds towards project`, async function () {
    const { snowProjectPayer, mockJbDirectory, mockJbTerminal } = await setup();

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(PROJECT_ID, ethToken)
      .returns(mockJbTerminal.address);

    // Eth payments should use 18 decimals.
    await mockJbTerminal.mock.decimalsForToken.withArgs(ethToken).returns(18);

    await mockJbTerminal.mock.pay
      .withArgs(
        PROJECT_ID,
        AMOUNT,
        ethToken,
        BENEFICIARY,
        MIN_RETURNED_TOKENS,
        PREFER_CLAIMED_TOKENS,
        MEMO,
        METADATA,
      )
      .returns(0);

    await expect(
      snowProjectPayer.pay(
        PROJECT_ID,
        ethToken,
        0,
        DECIMALS,
        BENEFICIARY,
        MIN_RETURNED_TOKENS,
        PREFER_CLAIMED_TOKENS,
        MEMO,
        METADATA,
        {
          value: AMOUNT,
        },
      ),
    ).to.not.be.reverted;
  });

  it(`Should pay and use the caller if no beneficiary is set`, async function () {
    const { caller, snowProjectPayer, mockJbDirectory, mockJbTerminal } = await setup();

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(PROJECT_ID, ethToken)
      .returns(mockJbTerminal.address);

    // Eth payments should use 18 decimals.
    await mockJbTerminal.mock.decimalsForToken.withArgs(ethToken).returns(18);

    await mockJbTerminal.mock.pay
      .withArgs(
        PROJECT_ID,
        AMOUNT,
        ethToken,
        caller.address,
        MIN_RETURNED_TOKENS,
        PREFER_CLAIMED_TOKENS,
        MEMO,
        METADATA,
      )
      .returns(0);

    await expect(
      snowProjectPayer
        .connect(caller)
        .pay(
          PROJECT_ID,
          ethToken,
          0,
          DECIMALS,
          ethers.constants.AddressZero,
          MIN_RETURNED_TOKENS,
          PREFER_CLAIMED_TOKENS,
          MEMO,
          METADATA,
          {
            value: AMOUNT,
          },
        ),
    ).to.not.be.reverted;
  });

  it(`Should pay funds towards project with a 9-decimals erc20 tokens`, async function () {
    const { snowProjectPayer, mockJbDirectory, mockJbTerminal, mockJbToken, addrs } = await setup();

    await mockJbTerminal.mock.decimalsForToken.withArgs(mockJbToken.address).returns(9);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(PROJECT_ID, mockJbToken.address)
      .returns(mockJbTerminal.address);

    await mockJbTerminal.mock.pay
      .withArgs(
        PROJECT_ID,
        AMOUNT,
        mockJbToken.address,
        BENEFICIARY,
        MIN_RETURNED_TOKENS,
        PREFER_CLAIMED_TOKENS,
        MEMO,
        METADATA,
      )
      .returns(0);

    const payer = addrs[0];
    await mockJbToken.mock['transferFrom(address,address,uint256)']
      .withArgs(payer.address, snowProjectPayer.address, AMOUNT)
      .returns(0);
    await mockJbToken.mock['approve(address,uint256)']
      .withArgs(mockJbTerminal.address, AMOUNT)
      .returns(0);
    await expect(
      snowProjectPayer
        .connect(payer)
        .pay(
          PROJECT_ID,
          mockJbToken.address,
          AMOUNT,
          9,
          BENEFICIARY,
          MIN_RETURNED_TOKENS,
          PREFER_CLAIMED_TOKENS,
          MEMO,
          METADATA,
        ),
    ).to.not.be.reverted;
  });

  it(`Should pay funds towards project using addToBalanceOf`, async function () {
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
      snowProjectPayer.addToBalanceOf(PROJECT_ID, ethToken, AMOUNT, DECIMALS, MEMO, METADATA, {
        value: AMOUNT,
      }),
    ).to.not.be.reverted;
  });

  it(`Should pay funds towards project using addToBalanceOf with a 9-decimals erc20 tokens`, async function () {
    const { snowProjectPayer, mockJbDirectory, mockJbTerminal, mockJbToken, addrs } = await setup();

    await mockJbTerminal.mock.decimalsForToken.withArgs(mockJbToken.address).returns(9);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(PROJECT_ID, mockJbToken.address)
      .returns(mockJbTerminal.address);

    await mockJbTerminal.mock.addToBalanceOf
      .withArgs(PROJECT_ID, AMOUNT, mockJbToken.address, MEMO, METADATA)
      .returns();

    const payer = addrs[0];
    await mockJbToken.mock['transferFrom(address,address,uint256)']
      .withArgs(payer.address, snowProjectPayer.address, AMOUNT)
      .returns(0);
    await mockJbToken.mock['approve(address,uint256)']
      .withArgs(mockJbTerminal.address, AMOUNT)
      .returns(0);
    await expect(
      snowProjectPayer
        .connect(payer)
        .addToBalanceOf(PROJECT_ID, mockJbToken.address, AMOUNT, 9, MEMO, METADATA),
    ).to.not.be.reverted;
  });

  it(`Fallback function should pay funds towards default project`, async function () {
    const { snowProjectPayer, mockJbDirectory, mockJbTerminal, addrs } = await setup();

    let caller = addrs[0];

    // fallback uses 18 decimals.
    await mockJbTerminal.mock.decimalsForToken.withArgs(ethToken).returns(18);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(INITIAL_PROJECT_ID, ethToken)
      .returns(mockJbTerminal.address);

    await mockJbTerminal.mock.pay
      .withArgs(
        INITIAL_PROJECT_ID,
        AMOUNT,
        ethToken,
        INITIAL_BENEFICIARY,
        0,
        INITIAL_PREFER_CLAIMED_TOKENS,
        INITIAL_MEMO,
        INITIAL_METADATA,
      )
      .returns(0);

    await expect(
      caller.sendTransaction({
        to: snowProjectPayer.address,
        value: AMOUNT,
      }),
    ).to.not.be.reverted;
  });

  it(`Fallback function should pay funds towards default project with no default beneficiary`, async function () {
    const { snowProjectPayer, mockJbDirectory, mockJbTerminal, owner, addrs } = await setup();

    let caller = addrs[0];

    // fallback uses 18 decimals.
    await mockJbTerminal.mock.decimalsForToken.withArgs(ethToken).returns(18);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(INITIAL_PROJECT_ID, ethToken)
      .returns(mockJbTerminal.address);

    // Set the default beneficiary to the zero address.

    await snowProjectPayer.connect(owner).setDefaultValues(
      INITIAL_PROJECT_ID,
      ethers.constants.AddressZero,
      INITIAL_PREFER_CLAIMED_TOKENS,
      INITIAL_MEMO,
      INITIAL_METADATA,
      false, // prefer add to balance
    );

    await mockJbTerminal.mock.pay
      .withArgs(
        INITIAL_PROJECT_ID,
        AMOUNT,
        ethToken,
        addrs[0].address,
        0,
        INITIAL_PREFER_CLAIMED_TOKENS,
        INITIAL_MEMO,
        INITIAL_METADATA,
      )
      .returns(0);

    await expect(
      caller.sendTransaction({
        to: snowProjectPayer.address,
        value: AMOUNT,
      }),
    ).to.not.be.reverted;
  });

  it(`Fallback function should pay ETH funds towards default project with addToBalance`, async function () {
    const { snowProjectPayer, mockJbDirectory, mockJbTerminal, owner, addrs } = await setup();

    let caller = addrs[0];

    // fallback uses 18 decimals.
    await mockJbTerminal.mock.decimalsForToken.withArgs(ethToken).returns(18);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(INITIAL_PROJECT_ID, ethToken)
      .returns(mockJbTerminal.address);

    // Set the default beneficiary to the zero address.

    await snowProjectPayer.connect(owner).setDefaultValues(
      INITIAL_PROJECT_ID,
      ethers.constants.AddressZero,
      INITIAL_PREFER_CLAIMED_TOKENS,
      INITIAL_MEMO,
      INITIAL_METADATA,
      true, // prefer add to balance
    );

    await mockJbTerminal.mock.addToBalanceOf
      .withArgs(INITIAL_PROJECT_ID, AMOUNT, ethToken, INITIAL_MEMO, INITIAL_METADATA)
      .returns();

    await expect(
      caller.sendTransaction({
        to: snowProjectPayer.address,
        value: AMOUNT,
      }),
    ).to.not.be.reverted;
  });

  it(`Can't pay if terminal not found`, async function () {
    const { snowProjectPayer, mockJbDirectory } = await setup();

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(PROJECT_ID, ethToken)
      .returns(ethers.constants.AddressZero);

    await expect(
      snowProjectPayer.pay(
        PROJECT_ID,
        ethToken,
        0,
        DECIMALS,
        BENEFICIARY,
        MIN_RETURNED_TOKENS,
        PREFER_CLAIMED_TOKENS,
        MEMO,
        METADATA,
        {
          value: AMOUNT,
        },
      ),
    ).to.be.revertedWith(errors.TERMINAL_NOT_FOUND);
  });

  it(`Can't pay if terminal uses different number of decimals`, async function () {
    const { snowProjectPayer, mockJbDirectory, mockJbTerminal } = await setup();

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(PROJECT_ID, ethToken)
      .returns(mockJbTerminal.address);

    await mockJbTerminal.mock.decimalsForToken.withArgs(ethToken).returns(10);

    await expect(
      snowProjectPayer.pay(
        PROJECT_ID,
        ethToken,
        0,
        18,
        BENEFICIARY,
        MIN_RETURNED_TOKENS,
        PREFER_CLAIMED_TOKENS,
        MEMO,
        METADATA,
        {
          value: AMOUNT,
        },
      ),
    ).to.be.revertedWith(errors.INCORRECT_DECIMAL_AMOUNT);
  });

  it(`Can't send value along with non-eth token`, async function () {
    const { snowProjectPayer, mockJbDirectory } = await setup();

    await expect(
      snowProjectPayer.pay(
        PROJECT_ID,
        ethers.constants.AddressZero,
        0,
        DECIMALS,
        BENEFICIARY,
        MIN_RETURNED_TOKENS,
        PREFER_CLAIMED_TOKENS,
        MEMO,
        METADATA,
        {
          value: AMOUNT,
        },
      ),
    ).to.be.revertedWith(errors.NO_MSG_VALUE_ALLOWED);
  });
});
