import { ethers } from 'hardhat';

import { RubicProxy } from '../typechain';

async function main() {
    const proxyFactory = await ethers.getContractFactory('RubicProxy');

    let proxy = (await proxyFactory.attach(
        '0x3335A88bb18fD3b6824b59Af62b50CE494143333'
    )) as RubicProxy;

    // await proxy.setRubicPlatformFee(0);
    // await proxy.grantRole(
    //     '0x241ecf16d79d0f8dbfb92cbc07fe17840425976cf0667f022fe9877caa831b08',
    //     '0x8F53A5BDE40F809958f5a0A568B7D65A4EB07349'
    // );
    // console.log('Role granted');
    // await proxy.setFixedCryptoFee('8333300000000000000');
    await proxy.addAvailableRouter('0x0e3EB2eAB0e524b69C79E24910f4318dB46bAa9c');
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
