import { ethers } from 'hardhat';
import { expect } from 'chai';
import { makeSplits } from '../helpers/utils.js';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import errors from '../helpers/errors.json';
import ierc20 from '../../artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json';
import snowAllocator from '../../artifacts/contracts/interfaces/ISNOWSplitAllocator.sol/ISNOWSplitAllocator.json';
import snowDirectory from '../../artifacts/contracts/SNOWDirectory.sol/SNOWDirectory.json';
import snowSplitsStore from '../../artifacts/contracts/SNOWSplitsStore.sol/SNOWSplitsStore.json';
import snowTerminal from '../../artifacts/contracts/abstract/SNOWPayoutRedemptionPaymentTerminal.sol/SNOWPayoutRedemptionPaymentTerminal.json';

describe('SNOWETHERC20SplitsPayer::receive()', function () {
  const DEFAULT_PROJECT_ID = 2;
  const DEFAULT_SPLITS_PROJECT_ID = 3;
  const DEFAULT_SPLITS_DOMAIN = 1;
  const DEFAULT_SPLITS_GROUP = 1;
  let DEFAULT_BENEFICIARY;
  const DEFAULT_PREFER_CLAIMED_TOKENS = false;
  const DEFAULT_MEMO = 'hello world';
  const DEFAULT_METADATA = '0x69';

  const PROJECT_ID = 69;
  const AMOUNT = ethers.utils.parseEther('1.0');
  const PREFER_ADD_TO_BALANCE = false;
  const PREFER_CLAIMED_TOKENS = true;
  const MIN_RETURNED_TOKENS = 1;
  const MEMO = 'hi world';
  const METADATA = '0x42';

  let ethToken;
  let maxSplitsPercent;

  this.beforeAll(async function () {
    let snowTokensFactory = await ethers.getContractFactory('SNOWTokens');
    let snowTokens = await snowTokensFactory.deploy();

    ethToken = await snowTokens.ETH();

    let snowConstantsFactory = await ethers.getContractFactory('SNOWConstants');
    let snowConstants = await snowConstantsFactory.deploy();

    maxSplitsPercent = await snowConstants.SPLITS_TOTAL_PERCENT();
  });

  async function setup() {
    let [deployer, owner, caller, beneficiaryOne, beneficiaryTwo, beneficiaryThree, defaultBeneficiarySigner, ...addrs] =
      await ethers.getSigners();

    DEFAULT_BENEFICIARY = defaultBeneficiarySigner.address;

    let mockJbDirectory = await deployMockContract(deployer, snowDirectory.abi);
    let mockJbSplitsStore = await deployMockContract(deployer, snowSplitsStore.abi);
    let mockJbTerminal = await deployMockContract(deployer, snowTerminal.abi);
    let mockToken = await deployMockContract(deployer, ierc20.abi);

    let snowSplitsPayerFactory = await ethers.getContractFactory('contracts/SNOWETHERC20SplitsPayer.sol:SNOWETHERC20SplitsPayer');

    await mockJbSplitsStore.mock.directory.returns(mockJbDirectory.address);

    let snowSplitsPayer = await snowSplitsPayerFactory.deploy(
      DEFAULT_SPLITS_PROJECT_ID,
      DEFAULT_SPLITS_DOMAIN,
      DEFAULT_SPLITS_GROUP,
      mockJbSplitsStore.address,
      DEFAULT_PROJECT_ID,
      DEFAULT_BENEFICIARY,
      DEFAULT_PREFER_CLAIMED_TOKENS,
      DEFAULT_MEMO,
      DEFAULT_METADATA,
      PREFER_ADD_TO_BALANCE,
      owner.address,
    );

    return {
      beneficiaryOne,
      beneficiaryTwo,
      beneficiaryThree,
      defaultBeneficiarySigner,
      deployer,
      caller,
      owner,
      addrs,
      mockToken,
      mockJbDirectory,
      mockJbTerminal,
      mockJbSplitsStore,
      snowSplitsPayer,
      snowSplitsPayerFactory,
    };
  }

  it(`Should send ETH towards allocator if set in split`, async function () {
    const { deployer, caller, snowSplitsPayer, mockJbSplitsStore } = await setup();

    let mockJbAllocator = await deployMockContract(deployer, snowAllocator.abi);

    let splits = makeSplits({ projectId: PROJECT_ID, allocator: mockJbAllocator.address });

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(DEFAULT_SPLITS_PROJECT_ID, DEFAULT_SPLITS_DOMAIN, DEFAULT_SPLITS_GROUP)
      .returns(splits);

    await Promise.all(
      splits.map(async (split) => {
        await mockJbAllocator.mock.allocate
          .withArgs({
            token: ethToken,
            amount: AMOUNT.mul(split.percent).div(maxSplitsPercent),
            decimals: 18,
            projectId: DEFAULT_PROJECT_ID,
            group: 0,
            split: split,
          })
          .returns();
      }),
    );

    let tx = await caller.sendTransaction({ to: snowSplitsPayer.address, value: AMOUNT });
    await expect(tx).to.changeEtherBalance(mockJbAllocator, AMOUNT);
  });

  it(`Should send fund towards project terminal if project ID is set in split and add to balance if it is prefered`, async function () {
    const { caller, snowSplitsPayer, mockJbSplitsStore, mockJbDirectory, mockJbTerminal } =
      await setup();

    let splits = makeSplits({ projectId: PROJECT_ID, preferAddToBalance: true });

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(PROJECT_ID, ethToken)
      .returns(mockJbTerminal.address);

    await mockJbTerminal.mock.decimalsForToken.withArgs(ethToken).returns(18);

    await Promise.all(
      splits.map(async (split) => {
        await mockJbTerminal.mock.addToBalanceOf
          .withArgs(
            split.projectId,
            AMOUNT.mul(split.percent).div(maxSplitsPercent),
            ethToken,
            DEFAULT_MEMO,
            DEFAULT_METADATA,
          )
          .returns();
      }),
    );

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(DEFAULT_SPLITS_PROJECT_ID, DEFAULT_SPLITS_DOMAIN, DEFAULT_SPLITS_GROUP)
      .returns(splits);

    let tx = await caller.sendTransaction({ to: snowSplitsPayer.address, value: AMOUNT });
    await expect(tx).to.changeEtherBalance(mockJbTerminal, AMOUNT);
  });

  it(`Should send fund towards project terminal if project ID is set in split, using pay with beneficiaries set in splits`, async function () {
    const {
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      snowSplitsPayer,
      mockJbSplitsStore,
      mockJbDirectory,
      mockJbTerminal,
    } = await setup();
    let splits = makeSplits({
      count: 2,
      projectId: PROJECT_ID,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(PROJECT_ID, ethToken)
      .returns(mockJbTerminal.address);

    await mockJbTerminal.mock.decimalsForToken.withArgs(ethToken).returns(18);

    await Promise.all(
      splits.map(async (split) => {
        await mockJbTerminal.mock.pay
          .withArgs(
            split.projectId,
            AMOUNT.mul(split.percent).div(maxSplitsPercent),
            ethToken,
            split.beneficiary,
            0 /*hardcoded*/,
            split.preferClaimed,
            DEFAULT_MEMO,
            DEFAULT_METADATA,
          )
          .returns(0); // Not used
      }),
    );

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(DEFAULT_SPLITS_PROJECT_ID, DEFAULT_SPLITS_DOMAIN, DEFAULT_SPLITS_GROUP)
      .returns(splits);

    let tx = await caller.sendTransaction({ to: snowSplitsPayer.address, value: AMOUNT });
    await expect(tx).to.changeEtherBalance(mockJbTerminal, AMOUNT);
  });

  it(`Should send fund towards project terminal if project ID is set in split, using pay with the default beneficiary if none is set in splits`, async function () {
    const { caller, snowSplitsPayer, mockJbSplitsStore, mockJbDirectory, mockJbTerminal } =
      await setup();

    let splits = makeSplits({ projectId: PROJECT_ID });

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(PROJECT_ID, ethToken)
      .returns(mockJbTerminal.address);

    await mockJbTerminal.mock.decimalsForToken.withArgs(ethToken).returns(18);

    await Promise.all(
      splits.map(async (split) => {
        await mockJbTerminal.mock.pay
          .withArgs(
            split.projectId,
            AMOUNT.mul(split.percent).div(maxSplitsPercent),
            ethToken,
            DEFAULT_BENEFICIARY,
            0 /*hardcoded*/,
            split.preferClaimed,
            DEFAULT_MEMO,
            DEFAULT_METADATA,
          )
          .returns(0); // Not used
      }),
    );

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(DEFAULT_SPLITS_PROJECT_ID, DEFAULT_SPLITS_DOMAIN, DEFAULT_SPLITS_GROUP)
      .returns(splits);

    let tx = await caller.sendTransaction({ to: snowSplitsPayer.address, value: AMOUNT });
    await expect(tx).to.changeEtherBalance(mockJbTerminal, AMOUNT);
  });

  it(`Should send fund directly to a beneficiary set in split, if no allocator or project ID is set in splits`, async function () {
    const { caller, beneficiaryOne, beneficiaryTwo, snowSplitsPayer, mockJbSplitsStore } =
      await setup();

    let splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(DEFAULT_SPLITS_PROJECT_ID, DEFAULT_SPLITS_DOMAIN, DEFAULT_SPLITS_GROUP)
      .returns(splits);

    let tx = await caller.sendTransaction({ to: snowSplitsPayer.address, value: AMOUNT });
    await expect(tx).to.changeEtherBalance(
      beneficiaryOne,
      AMOUNT.mul(splits[0].percent).div(maxSplitsPercent),
    );
    await expect(tx).to.changeEtherBalance(
      beneficiaryTwo,
      AMOUNT.mul(splits[0].percent).div(maxSplitsPercent),
    );
  });

  it(`Should send fund directly to the default beneficiary, if no allocator, project ID or beneficiary is set`, async function () {
    const { caller, snowSplitsPayer, mockJbSplitsStore, defaultBeneficiarySigner } = await setup();

    let splits = makeSplits();

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(DEFAULT_SPLITS_PROJECT_ID, DEFAULT_SPLITS_DOMAIN, DEFAULT_SPLITS_GROUP)
      .returns(splits);

    let tx = await caller.sendTransaction({ to: snowSplitsPayer.address, value: AMOUNT });
    await expect(tx).to.changeEtherBalance(defaultBeneficiarySigner, AMOUNT);
  });

  it(`Should send fund directly to the caller, if no allocator, project ID, beneficiary or default beneficiary is set`, async function () {
    const { caller, snowSplitsPayerFactory, mockJbSplitsStore, owner } = await setup();

    let snowSplitsPayerWithoutDefaultBeneficiary = await snowSplitsPayerFactory.deploy(
      DEFAULT_SPLITS_PROJECT_ID,
      DEFAULT_SPLITS_DOMAIN,
      DEFAULT_SPLITS_GROUP,
      mockJbSplitsStore.address,
      DEFAULT_PROJECT_ID,
      ethers.constants.AddressZero,
      DEFAULT_PREFER_CLAIMED_TOKENS,
      DEFAULT_MEMO,
      DEFAULT_METADATA,
      PREFER_ADD_TO_BALANCE,
      owner.address,
    );

    let splits = makeSplits();

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(DEFAULT_SPLITS_PROJECT_ID, DEFAULT_SPLITS_DOMAIN, DEFAULT_SPLITS_GROUP)
      .returns(splits);

    let tx = await caller.sendTransaction({ to: snowSplitsPayerWithoutDefaultBeneficiary.address, value: AMOUNT });
    await expect(tx).to.changeEtherBalance(caller, 0); // -AMOUNT then +AMOUNT, gas is not taken into account
  });

  it(`Should send eth leftover to project id if set, using pay`, async function () {
    const {
      caller,
      snowSplitsPayer,
      mockJbDirectory,
      mockJbSplitsStore,
      mockJbTerminal,
      beneficiaryOne,
      beneficiaryTwo,
      beneficiaryThree,
    } = await setup();

    // 50% to beneficiaries
    let splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
      percent: maxSplitsPercent.div('4'),
    });

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(DEFAULT_SPLITS_PROJECT_ID, DEFAULT_SPLITS_DOMAIN, DEFAULT_SPLITS_GROUP)
      .returns(splits);

    await mockJbTerminal.mock.decimalsForToken.withArgs(ethToken).returns(18);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(DEFAULT_PROJECT_ID, ethToken)
      .returns(mockJbTerminal.address);

    await mockJbTerminal.mock.pay
      .withArgs(
        DEFAULT_PROJECT_ID,
        AMOUNT.div('2'),
        ethToken,
        DEFAULT_BENEFICIARY,
        0,
        DEFAULT_PREFER_CLAIMED_TOKENS,
        DEFAULT_MEMO,
        DEFAULT_METADATA,
      )
      .returns(0); // Not used

    let tx = await caller.sendTransaction({ to: snowSplitsPayer.address, value: AMOUNT });
    await expect(tx).to.changeEtherBalance(
      beneficiaryOne,
      AMOUNT.mul(splits[0].percent).div(maxSplitsPercent),
    );
    await expect(tx).to.changeEtherBalance(
      beneficiaryTwo,
      AMOUNT.mul(splits[0].percent).div(maxSplitsPercent),
    );
    await expect(tx).to.changeEtherBalance(mockJbTerminal, AMOUNT.div(2));
  });

  it(`Should send eth leftover to project id if set, using addToBalance`, async function () {
    const {
      caller,
      owner,
      snowSplitsPayerFactory,
      mockJbDirectory,
      mockJbSplitsStore,
      mockJbTerminal,
      beneficiaryOne,
      beneficiaryTwo,
      beneficiaryThree,
    } = await setup();

    let snowSplitsPayerPreferAddToBalance = await snowSplitsPayerFactory.deploy(
      DEFAULT_SPLITS_PROJECT_ID,
      DEFAULT_SPLITS_DOMAIN,
      DEFAULT_SPLITS_GROUP,
      mockJbSplitsStore.address,
      DEFAULT_PROJECT_ID,
      DEFAULT_BENEFICIARY,
      DEFAULT_PREFER_CLAIMED_TOKENS,
      DEFAULT_MEMO,
      DEFAULT_METADATA,
      true,
      owner.address,
    );

    // 50% to beneficiaries
    let splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
      percent: maxSplitsPercent.div('4'),
    });

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(DEFAULT_SPLITS_PROJECT_ID, DEFAULT_SPLITS_DOMAIN, DEFAULT_SPLITS_GROUP)
      .returns(splits);

    await mockJbTerminal.mock.decimalsForToken.withArgs(ethToken).returns(18);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(DEFAULT_PROJECT_ID, ethToken)
      .returns(mockJbTerminal.address);

    await mockJbTerminal.mock.addToBalanceOf
      .withArgs(DEFAULT_PROJECT_ID, AMOUNT.div('2'), ethToken, DEFAULT_MEMO, DEFAULT_METADATA)
      .returns();

    let tx = await caller.sendTransaction({
      to: snowSplitsPayerPreferAddToBalance.address,
      value: AMOUNT,
    });
    await expect(tx).to.changeEtherBalance(
      beneficiaryOne,
      AMOUNT.mul(splits[0].percent).div(maxSplitsPercent),
    );
    await expect(tx).to.changeEtherBalance(
      beneficiaryTwo,
      AMOUNT.mul(splits[0].percent).div(maxSplitsPercent),
    );
    await expect(tx).to.changeEtherBalance(mockJbTerminal, AMOUNT.div(2));
  });

  it(`Should send eth leftover to beneficiary if no project id set`, async function () {
    const {
      caller,
      owner,
      snowSplitsPayerFactory,
      mockJbSplitsStore,
      mockJbTerminal,
      beneficiaryOne,
      beneficiaryTwo,
      beneficiaryThree,
    } = await setup();

    let snowSplitsPayer = await snowSplitsPayerFactory.deploy(
      DEFAULT_SPLITS_PROJECT_ID,
      DEFAULT_SPLITS_DOMAIN,
      DEFAULT_SPLITS_GROUP,
      mockJbSplitsStore.address,
      0,
      beneficiaryThree.address,
      DEFAULT_PREFER_CLAIMED_TOKENS,
      DEFAULT_MEMO,
      DEFAULT_METADATA,
      true,
      owner.address,
    );
    // 50% to beneficiaries
    let splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
      percent: maxSplitsPercent.div('4'),
    });

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(DEFAULT_SPLITS_PROJECT_ID, DEFAULT_SPLITS_DOMAIN, DEFAULT_SPLITS_GROUP)
      .returns(splits);

    await mockJbTerminal.mock.decimalsForToken.withArgs(ethToken).returns(18);

    await mockJbTerminal.mock.pay
      .withArgs(
        0,
        AMOUNT.div('2'),
        ethToken,
        beneficiaryThree.address,
        MIN_RETURNED_TOKENS,
        PREFER_CLAIMED_TOKENS,
        MEMO,
        METADATA,
      )
      .returns(0); // Not used

    let tx = await caller.sendTransaction({ to: snowSplitsPayer.address, value: AMOUNT });
    await expect(tx).to.changeEtherBalance(beneficiaryThree, AMOUNT.div('2'));
  });

  it(`Should send eth leftover to the caller if no project id nor beneficiary is set`, async function () {
    const {
      caller,
      owner,
      snowSplitsPayerFactory,
      mockJbSplitsStore,
      mockJbTerminal,
      beneficiaryOne,
      beneficiaryTwo,
      beneficiaryThree,
    } = await setup();

    let snowSplitsPayer = await snowSplitsPayerFactory.deploy(
      DEFAULT_SPLITS_PROJECT_ID,
      DEFAULT_SPLITS_DOMAIN,
      DEFAULT_SPLITS_GROUP,
      mockJbSplitsStore.address,
      0,
      ethers.constants.AddressZero,
      DEFAULT_PREFER_CLAIMED_TOKENS,
      DEFAULT_MEMO,
      DEFAULT_METADATA,
      true,
      owner.address,
    );
    // 50% to beneficiaries
    let splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
      percent: maxSplitsPercent.div('4'),
    });

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(DEFAULT_SPLITS_PROJECT_ID, DEFAULT_SPLITS_DOMAIN, DEFAULT_SPLITS_GROUP)
      .returns(splits);

    await mockJbTerminal.mock.decimalsForToken.withArgs(ethToken).returns(18);

    await mockJbTerminal.mock.pay
      .withArgs(
        0,
        AMOUNT.div('2'),
        ethToken,
        beneficiaryThree.address,
        MIN_RETURNED_TOKENS,
        PREFER_CLAIMED_TOKENS,
        MEMO,
        METADATA,
      )
      .returns(0); // Not used

    let tx = await caller.sendTransaction({ to: snowSplitsPayer.address, value: AMOUNT });
    await expect(tx).to.changeEtherBalance(caller, AMOUNT.div('-2'));
  });
});
