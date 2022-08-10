import { ethers } from 'hardhat';

import { RubicProxy } from '../typechain';

async function main() {
    const proxyFactory = await ethers.getContractFactory('RubicProxy');

    let proxy = (await proxyFactory.attach(
        '0x3332241a5a4eCb4c28239A9731ad45De7f000333'
    )) as RubicProxy;

    await proxy.setRubicPlatformFee(0);
    await proxy.grantRole(
        '0x241ecf16d79d0f8dbfb92cbc07fe17840425976cf0667f022fe9877caa831b08',
        '0x30a47a58459405dA8fE5cdDDaAcE66Ba005423F1'
    );
    await proxy.setFixedCryptoFee('8333300000000000000');
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
