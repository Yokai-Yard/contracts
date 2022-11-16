import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import snowDirectory from '../../artifacts/contracts/SNOWDirectory.sol/SNOWDirectory.json';

describe('SNOWProjectPayerDeployer::deployProjectPayer(...)', function () {
  const INITIAL_PROJECT_ID = 1;
  const INITIAL_BENEFICIARY = ethers.Wallet.createRandom().address;
  const INITIAL_PREFER_CLAIMED_TOKENS = false;
  const INITIAL_PREFER_ADD_TO_BALANCE = false;
  const INITIAL_MEMO = 'hello world';
  const INITIAL_METADATA = '0x69';

  async function setup() {
    const [deployer, owner] = await ethers.getSigners();

    const mockJbDirectory = await deployMockContract(deployer, snowDirectory.abi);

    const snowProjectPayerDeployerFactory = await ethers.getContractFactory(
      'SNOWETHERC20ProjectPayerDeployer',
    );
    const snowProjectPayerDeployer = await snowProjectPayerDeployerFactory.deploy();

    return {
      owner,
      mockJbDirectory,
      snowProjectPayerDeployer,
    };
  }

  it('Should deploy the project payer', async function () {
    const { owner, mockJbDirectory, snowProjectPayerDeployer } = await setup();

    const currentNonce = await ethers.provider.getTransactionCount(snowProjectPayerDeployer.address);
    const snowProjectPayerAddress = ethers.utils.getContractAddress({
      from: snowProjectPayerDeployer.address,
      nonce: currentNonce,
    });

    const tx = await snowProjectPayerDeployer
      .connect(owner)
      .deployProjectPayer(
        INITIAL_PROJECT_ID,
        INITIAL_BENEFICIARY,
        INITIAL_PREFER_CLAIMED_TOKENS,
        INITIAL_MEMO,
        INITIAL_METADATA,
        INITIAL_PREFER_ADD_TO_BALANCE,
        mockJbDirectory.address,
        owner.address,
      );

    await expect(tx)
      .to.emit(snowProjectPayerDeployer, 'DeployProjectPayer')
      .withArgs(
        snowProjectPayerAddress,
        INITIAL_PROJECT_ID,
        INITIAL_BENEFICIARY,
        INITIAL_PREFER_CLAIMED_TOKENS,
        INITIAL_MEMO,
        INITIAL_METADATA,
        INITIAL_PREFER_ADD_TO_BALANCE,
        mockJbDirectory.address,
        owner.address,
        owner.address,
      );
  });
});
