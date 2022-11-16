import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import snowOperatoreStore from '../../artifacts/contracts/SNOWOperatorStore.sol/SNOWOperatorStore.json';
import snowTokenUriResolver from '../../artifacts/contracts/interfaces/ISNOWTokenUriResolver.sol/ISNOWTokenUriResolver.json';

describe('SNOWProjects::setTokenUriResolver(...)', function () {
  async function setup() {
    let [deployer, caller] = await ethers.getSigners();

    let mockJbTokenUriResolver = await deployMockContract(deployer, snowTokenUriResolver.abi);
    let mockJbOperatorStore = await deployMockContract(deployer, snowOperatoreStore.abi);

    let snowProjectsFactory = await ethers.getContractFactory('SNOWProjects');
    let snowProjects = await snowProjectsFactory.deploy(mockJbOperatorStore.address);

    return {
      deployer,
      caller,
      snowProjects,
      mockJbTokenUriResolver,
    };
  }

  it(`Should set the tokenUri resolver and emit event, if called by the contract owner`, async function () {
    const { deployer, snowProjects, mockJbTokenUriResolver } = await setup();

    expect(await snowProjects.connect(deployer).setTokenUriResolver(mockJbTokenUriResolver.address))
      .to.emit(snowProjects, 'SetTokenUriResolver')
      .withArgs(mockJbTokenUriResolver.address, deployer.address);

    expect(await snowProjects.tokenUriResolver()).to.equal(mockJbTokenUriResolver.address);
  });

  it(`Can't set the tokenUri resolver if caller is not the contract owner`, async function () {
    const { caller, snowProjects, mockJbTokenUriResolver } = await setup();

    await expect(snowProjects.connect(caller).setTokenUriResolver(mockJbTokenUriResolver.address)).to
      .be.reverted;
  });
});
