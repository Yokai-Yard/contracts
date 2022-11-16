import { ethers } from 'hardhat';
import { expect } from 'chai';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import snowDirectory from '../../artifacts/contracts/SNOWDirectory.sol/SNOWDirectory.json';
import snowSplitsStore from '../../artifacts/contracts/SNOWSplitsStore.sol/SNOWSplitsStore.json';

describe('SNOWSplitsPayerDeployer::deploySplitsPayer(...)', function () {
  const DEFAULT_PROJECT_ID = 2;
  const DEFAULT_SPLITS_PROJECT_ID = 3;
  const DEFAULT_SPLITS_DOMAIN = 2;
  const DEFAULT_SPLITS_GROUP = 4;
  const DEFAULT_BENEFICIARY = ethers.Wallet.createRandom().address;
  const DEFAULT_PREFER_CLAIMED_TOKENS = true;
  const DEFAULT_MEMO = 'hello world';
  const DEFAULT_METADATA = '0x69';
  const PREFER_ADD_TO_BALANCE = true;

  async function setup() {
    let [deployer, owner, ...addrs] = await ethers.getSigners();

    let mockJbDirectory = await deployMockContract(deployer, snowDirectory.abi);
    let mockJbSplitsStore = await deployMockContract(deployer, snowSplitsStore.abi);
    let snowSplitsPayerDeployerFactory = await ethers.getContractFactory(
      'contracts/SNOWETHERC20SplitsPayerDeployer.sol:SNOWETHERC20SplitsPayerDeployer',
    );
    let snowSplitsPayerDeployer = await snowSplitsPayerDeployerFactory.deploy();

    await mockJbSplitsStore.mock.directory.returns(mockJbDirectory.address);

    return {
      deployer,
      owner,
      snowSplitsPayerDeployer,
      mockJbSplitsStore,
    };
  }

  it(`Should deploy and emit event`, async function () {
    let { deployer, owner, snowSplitsPayerDeployer, mockJbSplitsStore } = await setup();

    const currentNonce = await ethers.provider.getTransactionCount(snowSplitsPayerDeployer.address);
    const splitsPayerAddress = ethers.utils.getContractAddress({
      from: snowSplitsPayerDeployer.address,
      nonce: currentNonce,
    });

    let tx = await snowSplitsPayerDeployer
      .connect(deployer)
      .deploySplitsPayer(
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

    await expect(tx)
      .to.emit(snowSplitsPayerDeployer, 'DeploySplitsPayer')
      .withArgs(
        splitsPayerAddress,
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
        deployer.address,
      );
  });
});
