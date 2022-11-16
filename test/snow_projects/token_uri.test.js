import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import snowOperatoreStore from '../../artifacts/contracts/SNOWOperatorStore.sol/SNOWOperatorStore.json';
import snowTokenUriResolver from '../../artifacts/contracts/interfaces/ISNOWTokenUriResolver.sol/ISNOWTokenUriResolver.json';

describe('SNOWProjects::tokenURI(...)', function () {
  const TOKEN_URI = 'ipfs://randommetadatacidipsaddress';
  const PROJECT_ID = 69;

  async function setup() {
    let [deployer] = await ethers.getSigners();

    let mockJbTokenUriResolver = await deployMockContract(deployer, snowTokenUriResolver.abi);
    let mockJbOperatorStore = await deployMockContract(deployer, snowOperatoreStore.abi);

    let snowProjectsFactory = await ethers.getContractFactory('SNOWProjects');
    let snowProjects = await snowProjectsFactory.deploy(mockJbOperatorStore.address);

    mockJbTokenUriResolver.mock.getUri.withArgs(PROJECT_ID).returns(TOKEN_URI);

    return {
      deployer,
      snowProjects,
      mockJbTokenUriResolver,
    };
  }

  it(`Should return an empty string if the token URI resolver is not set`, async function () {
    const { snowProjects } = await setup();

    expect(await snowProjects.tokenURI(PROJECT_ID)).to.equal('');
  });

  it(`Should return the correct URI if the token URI resolver is set`, async function () {
    const { deployer, snowProjects, mockJbTokenUriResolver } = await setup();

    await snowProjects.connect(deployer).setTokenUriResolver(mockJbTokenUriResolver.address);

    expect(await snowProjects.tokenURI(PROJECT_ID)).to.equal(TOKEN_URI);
  });
});
