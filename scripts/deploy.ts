const hre = require('hardhat');
import { ethers, network } from 'hardhat';
import Config from '../config/config.json';

async function main() {
    const RubicProxyFactory = await ethers.getContractFactory('RubicProxy');
    const chain = Config.chains.find(_chain => _chain.id === network.config.chainId);

    if (chain !== undefined) {
        const RubicProxy = await RubicProxyFactory.deploy(
            0,
            1500,
            [
                '0x663DC15D3C1aC63ff12E45Ab68FeA3F0a883C251',
                '0x362fa9d0bca5d19f743db50738345ce2b40ec99f',
                chain.metaRouter,
                chain.metaRouterGateway
            ],
            [],
            [],
            []
        );

        await RubicProxy.deployed();

        console.log('RubicProxy deployed to ', RubicProxy.address);

        await new Promise(r => setTimeout(r, 10000));

        await hre.run('verify:verify', {
            address: RubicProxy.address,
            constructorArguments: [
                0,
                1500,
                [
                    '0x663DC15D3C1aC63ff12E45Ab68FeA3F0a883C251',
                    '0x362fa9d0bca5d19f743db50738345ce2b40ec99f',
                    chain.metaRouter,
                    chain.metaRouterGateway
                ],
                [],
                [],
                []
            ]
        });
    } else {
        console.log('Missing Symbiosis data');
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
