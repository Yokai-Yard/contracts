import { expect } from 'chai';
import { deployJbToken } from '../helpers/utils';

describe('SNOWToken::decimals(...)', function () {
  it('Should have 18 decimals', async function () {
    const snowToken = await deployJbToken('asdf', 'asdf');
    const decimals = await snowToken.decimals();
    expect(decimals).to.equal(18);
  });
});
