import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import snowDirectory from '../../artifacts/contracts/SNOWDirectory.sol/SNOWDirectory.json';
import snowOperatoreStore from '../../artifacts/contracts/SNOWOperatorStore.sol/SNOWOperatorStore.json';
import snowProjects from '../../artifacts/contracts/SNOWProjects.sol/SNOWProjects.json';

describe('SNOWTokenStore::totalySupplyOf(...)', function () {
  const PROJECT_ID = 2;
  const TOKEN_NAME = 'TestTokenDAO';
  const TOKEN_SYMBOL = 'TEST';

  async function setup() {
    const [deployer, ...addrs] = await ethers.getSigners();

    const mockJbOperatorStore = await deployMockContract(deployer, snowOperatoreStore.abi);
    const mockJbProjects = await deployMockContract(deployer, snowProjects.abi);
    const mockJbDirectory = await deployMockContract(deployer, snowDirectory.abi);

    const snowTokenStoreFactory = await ethers.getContractFactory('SNOWTokenStore');
    const snowTokenStore = await snowTokenStoreFactory.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbDirectory.address,
    );

    return {
      addrs,
      mockJbDirectory,
      snowTokenStore,
    };
  }

  it('Should return total supply of tokens for given projectId', async function () {
    const { addrs, mockJbDirectory, snowTokenStore } = await setup();
    const controller = addrs[0];

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    await snowTokenStore.connect(controller).issueFor(PROJECT_ID, TOKEN_NAME, TOKEN_SYMBOL);

    // Mint unclaimed tokens
    const newHolder = addrs[1];
    const numTokens = 20;
    await snowTokenStore
      .connect(controller)
      .mintFor(newHolder.address, PROJECT_ID, numTokens, /* _preferClaimedTokens= */ false);

    // Mint claimed tokens for another holder
    const anotherHolder = addrs[2];
    await snowTokenStore
      .connect(controller)
      .mintFor(anotherHolder.address, PROJECT_ID, numTokens, /* preferClaimedTokens= */ true);

    expect(await snowTokenStore.totalSupplyOf(PROJECT_ID)).to.equal(numTokens * 2);
  });

  it('Should return 0 if a token for projectId is not found', async function () {
    const { snowTokenStore } = await setup();

    expect(await snowTokenStore.totalSupplyOf(PROJECT_ID)).to.equal(0);
  });
});
