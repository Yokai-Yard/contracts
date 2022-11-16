import { ethers } from 'hardhat';
import { expect } from 'chai';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import snowDirectory from '../../artifacts/contracts/SNOWDirectory.sol/SNOWDirectory.json';
import snowSplitsStore from '../../artifacts/contracts/SNOWSplitsStore.sol/SNOWSplitsStore.json';

describe('SNOWETHERC20SplitsPayer::setDefaultSplits()', function () {
  const DEFAULT_PROJECT_ID = 2;
  const DEFAULT_SPLITS_PROJECT_ID = 3;
  const DEFAULT_SPLITS_DOMAIN = 1;
  const DEFAULT_SPLITS_GROUP = 1;
  const DEFAULT_BENEFICIARY = ethers.Wallet.createRandom().address;
  const DEFAULT_PREFER_CLAIMED_TOKENS = false;
  const DEFAULT_MEMO = 'hello world';
  const DEFAULT_METADATA = [0x1];
  const PREFER_ADD_TO_BALANCE = false;

  const NEW_SPLITS_PROJECT_ID = 69;
  const NEW_SPLITS_DOMAIN = 420;
  const NEW_SPLITS_GROUP = 69420;

  async function setup() {
    let [deployer, owner, caller, ...addrs] = await ethers.getSigners();

    let mockJbDirectory = await deployMockContract(deployer, snowDirectory.abi);
    let mockJbSplitsStore = await deployMockContract(deployer, snowSplitsStore.abi);
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
      deployer,
      caller,
      owner,
      addrs,
      snowSplitsPayer,
    };
  }

  it(`Should set new default splits and emit events`, async function () {
    const { owner, snowSplitsPayer } = await setup();

    await expect(
      snowSplitsPayer
        .connect(owner)
        .setDefaultSplits(NEW_SPLITS_PROJECT_ID, NEW_SPLITS_DOMAIN, NEW_SPLITS_GROUP),
    )
      .to.emit(snowSplitsPayer, 'SetDefaultSplits')
      .withArgs(NEW_SPLITS_PROJECT_ID, NEW_SPLITS_DOMAIN, NEW_SPLITS_GROUP, owner.address);

    expect(await snowSplitsPayer.defaultSplitsProjectId()).to.equal(NEW_SPLITS_PROJECT_ID);
    expect(await snowSplitsPayer.defaultSplitsDomain()).to.equal(NEW_SPLITS_DOMAIN);
    expect(await snowSplitsPayer.defaultSplitsGroup()).to.equal(NEW_SPLITS_GROUP);
  });

  it(`Should not change if new default splits equal previous splits, and emit events`, async function () {
    const { owner, snowSplitsPayer } = await setup();

    await expect(
      snowSplitsPayer
        .connect(owner)
        .setDefaultSplits(DEFAULT_SPLITS_PROJECT_ID, DEFAULT_SPLITS_DOMAIN, DEFAULT_SPLITS_GROUP),
    )
      .to.emit(snowSplitsPayer, 'SetDefaultSplits')
      .withArgs(
        DEFAULT_SPLITS_PROJECT_ID,
        DEFAULT_SPLITS_DOMAIN,
        DEFAULT_SPLITS_GROUP,
        owner.address,
      );

    expect(await snowSplitsPayer.defaultSplitsProjectId()).to.equal(DEFAULT_SPLITS_PROJECT_ID);
    expect(await snowSplitsPayer.defaultSplitsDomain()).to.equal(DEFAULT_SPLITS_DOMAIN);
    expect(await snowSplitsPayer.defaultSplitsGroup()).to.equal(DEFAULT_SPLITS_GROUP);
  });

  it(`Cannot change default splits if caller is not the owner`, async function () {
    const { caller, snowSplitsPayer } = await setup();

    await expect(
      snowSplitsPayer
        .connect(caller)
        .setDefaultSplits(DEFAULT_SPLITS_PROJECT_ID, DEFAULT_SPLITS_DOMAIN, DEFAULT_SPLITS_GROUP),
    ).to.be.revertedWith('Ownable: caller is not the owner');
  });
});
