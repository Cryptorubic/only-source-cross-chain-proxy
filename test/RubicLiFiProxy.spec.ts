import { ethers, waffle, network } from 'hardhat';
import LIFI, { Step } from '@lifinance/sdk';
import { Wallet } from '@ethersproject/wallet';
import { RubicLiFiProxy, TestToken } from '../typechain';
import { assert, expect } from 'chai';
import { BigNumber } from 'ethers';
import { INTEGRATOR_FEE, DENOMINATOR, PLATFORM_SHARE } from './shared/consts';
import { symbiosisProxyFixture } from './shared/fixtures';
import * as axios from 'axios';

const createFixtureLoader = waffle.createFixtureLoader;

describe('RubicLiFiProxy', () => {
    let owner: Wallet, integratorWallet: Wallet, admin: Wallet;
    let lifi: LIFI;
    let proxy: RubicLiFiProxy;
    let transitToken: TestToken;
    let swapToken: TestToken;

    let loadFixture: ReturnType<typeof createFixtureLoader>;

    async function getSwapData(firstStep: Step): Promise<string> {
        const step = {
            ...firstStep,
            action: {
                ...firstStep.action,
                fromAddress: owner.address,
                toAddress: owner.address
            },
            execution: {
                status: 'NOT_STARTED',
                process: [
                    {
                        message: 'Preparing transaction.',
                        startedAt: Date.now(),
                        status: 'STARTED',
                        type: 'CROSS_CHAIN'
                    }
                ]
            }
        };

        const response = await axios.default.post('https://li.quest/v1/advanced/stepTransaction', {
            ...step
        });

        return response.data.transactionRequest.data;
    }

    async function callProxy(
        totalInAmount: BigNumber,
        inputToken?: TestToken,
        integrator = ethers.constants.AddressZero
    ): Promise<BigNumber> {
        let fee: BigNumber;

        if (integrator !== ethers.constants.AddressZero) {
            fee = BigNumber.from((await proxy.integratorToFeeInfo(integrator)).tokenFee);
        } else {
            fee = await proxy.RubicPlatformFee();
        }
        const amountWithoutFee = totalInAmount.mul(DENOMINATOR.sub(fee)).div(DENOMINATOR);
        const feeAmount = totalInAmount.sub(amountWithoutFee);

        let result;

        if (inputToken !== undefined) {
            result = await lifi.getRoutes({
                fromChainId: network.config.chainId || 31337,
                fromAmount: amountWithoutFee.toString(),
                fromTokenAddress: inputToken.address,
                toChainId: 56,
                toTokenAddress: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56'
            });
        } else {
            result = await lifi.getRoutes({
                fromChainId: network.config.chainId || 31337,
                fromAmount: amountWithoutFee.toString(),
                fromTokenAddress: ethers.constants.AddressZero,
                toChainId: 56,
                toTokenAddress: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56'
            });
        }

        const transactionRequest = await getSwapData(result.routes[0].steps[0]);

        if (transactionRequest !== undefined) {
            if (inputToken !== undefined) {
                await inputToken.approve(proxy.address, ethers.constants.MaxUint256);

                await proxy.lifiCall(
                    {
                        srcInputToken: inputToken.address,
                        dstOutputToken: ethers.constants.AddressZero,
                        integrator: integrator,
                        recipient: ethers.constants.AddressZero,
                        srcInputAmount: totalInAmount,
                        dstMinOutputAmount: 0,
                        dstChainID: 0
                    },
                    transactionRequest
                );

                expect(await inputToken.balanceOf(proxy.address)).to.be.eq(feeAmount);
            } else {
                await proxy.lifiCallWithNative(
                    {
                        srcInputToken: ethers.constants.AddressZero,
                        dstOutputToken: ethers.constants.AddressZero,
                        integrator: integrator,
                        recipient: ethers.constants.AddressZero,
                        srcInputAmount: totalInAmount,
                        dstMinOutputAmount: 0,
                        dstChainID: 0
                    },
                    transactionRequest,
                    {
                        value: totalInAmount
                    }
                );

                expect(await waffle.provider.getBalance(proxy.address)).to.be.eq(feeAmount);
            }
        }

        return feeAmount;
    }

    async function assertIntegratorFee(
        integrator: string,
        token: string,
        inputAmount: BigNumber
    ): Promise<{ platformFee: BigNumber; integratorFee: BigNumber }> {
        const feeInfo = await proxy.integratorToFeeInfo(integrator);
        const fee = BigNumber.from(feeInfo.tokenFee);
        const share = BigNumber.from(feeInfo.RubicTokenShare);

        const totalFee = inputAmount.mul(fee).div(DENOMINATOR);
        const platformFee = totalFee.mul(share).div(DENOMINATOR);
        const integratorFee = totalFee.sub(platformFee);

        expect(await proxy.availableIntegratorFee(token, integrator)).to.be.eq(integratorFee);
        expect(await proxy.availableRubicFee(token)).to.be.eq(platformFee);

        return Promise.resolve({ platformFee, integratorFee });
    }

    async function collectTokenFees(
        platformFee: BigNumber,
        integratorFee: BigNumber,
        token: TestToken
    ) {
        await proxy.connect(integratorWallet)['collectIntegratorFee(address)'](token.address);

        const ownerBalanceBefore = await token.balanceOf(admin.address);

        await proxy.connect(admin).collectRubicFee(token.address);

        const ownerBalanceAfter = await token.balanceOf(admin.address);

        expect(await token.balanceOf(integratorWallet.address)).to.be.eq(integratorFee);
        expect(ownerBalanceAfter.sub(ownerBalanceBefore)).to.be.eq(platformFee);
        expect(await proxy.availableRubicFee(token.address)).to.be.eq('0');
        expect(
            await proxy.availableIntegratorFee(token.address, integratorWallet.address)
        ).to.be.eq('0');
    }

    async function collectNativeFees(platformFee: BigNumber, integratorFee: BigNumber) {
        const ownerBalanceBefore = await waffle.provider.getBalance(admin.address);
        const ownerIntegratorBefore = await waffle.provider.getBalance(integratorWallet.address);

        await proxy
            .connect(integratorWallet)
            ['collectIntegratorFee(address)'](ethers.constants.AddressZero);

        await proxy.connect(admin).collectRubicFee(ethers.constants.AddressZero);

        const ownerBalanceAfter = await waffle.provider.getBalance(admin.address);
        const ownerIntegratorAfter = await waffle.provider.getBalance(integratorWallet.address);

        expect(ownerIntegratorAfter.sub(ownerIntegratorBefore)).to.be.closeTo(
            integratorFee,
            '18' + '0'.repeat(15)
        );
        expect(ownerBalanceAfter.sub(ownerBalanceBefore)).to.be.closeTo(
            platformFee,
            '18' + '0'.repeat(15)
        );
        expect(await proxy.availableRubicFee(ethers.constants.AddressZero)).to.be.eq('0');
        expect(
            await proxy.availableIntegratorFee(
                ethers.constants.AddressZero,
                integratorWallet.address
            )
        ).to.be.eq('0');
    }

    before('initialize', async () => {
        lifi = new LIFI();
        [owner, integratorWallet, admin] = await (ethers as any).getSigners();
        loadFixture = createFixtureLoader([owner]);
    });

    beforeEach('deploy proxy', async () => {
        ({ proxy, transitToken, swapToken } = await loadFixture(symbiosisProxyFixture));
    });

    describe('#base', () => {
        it('token swap works', async () => {
            const totalInAmount = BigNumber.from('1000' + '0'.repeat(18));
            const feeAmount = await callProxy(totalInAmount, swapToken);

            expect(await proxy.availableRubicFee(swapToken.address)).to.be.eq(feeAmount);
        });

        it('native swap works', async () => {
            const totalInAmount = BigNumber.from('1000' + '0'.repeat(18));
            const feeAmount = await callProxy(totalInAmount);

            expect(await proxy.availableRubicFee(ethers.constants.AddressZero)).to.be.eq(feeAmount);
        });

        it('bridge works', async () => {
            const totalInAmount = BigNumber.from('100000000');
            const feeAmount = await callProxy(totalInAmount, transitToken);

            expect(await proxy.availableRubicFee(transitToken.address)).to.be.eq(feeAmount);
        });

        it('pause works', async () => {
            const totalInAmount = BigNumber.from('100000000');

            await proxy.pauseExecution();

            await expect(callProxy(totalInAmount, transitToken)).to.be.revertedWith(
                'Pausable: paused'
            );
        });
    });

    describe('#fee', () => {
        let integrator: string;

        before('init', () => {
            integrator = integratorWallet.address;
        });

        beforeEach('set integrator fee', async () => {
            await proxy.grantRole(await proxy.MANAGER_ROLE(), admin.address);
            assert.isTrue(await proxy.isManager(admin.address));
            await proxy.connect(admin).setIntegratorInfo(integrator, {
                isIntegrator: true,
                tokenFee: INTEGRATOR_FEE,
                RubicTokenShare: PLATFORM_SHARE,
                fixedCryptoShare: '0'
            });
        });

        it('can set integrator fee', async () => {
            const feeInfo = await proxy.integratorToFeeInfo(integrator);
            expect(BigNumber.from(feeInfo.tokenFee)).to.be.eq(INTEGRATOR_FEE);
            expect(BigNumber.from(feeInfo.RubicTokenShare)).to.be.eq(PLATFORM_SHARE);
        });

        it('integrator fee works with bridge', async () => {
            const totalInAmount = BigNumber.from('100000000');
            await callProxy(totalInAmount, transitToken, integrator);

            const { platformFee, integratorFee } = await assertIntegratorFee(
                integrator,
                transitToken.address,
                totalInAmount
            );

            await collectTokenFees(platformFee, integratorFee, transitToken);
        });

        it('integrator fee works with token', async () => {
            const totalInAmount = BigNumber.from('1000' + '0'.repeat(18));
            await callProxy(totalInAmount, swapToken, integrator);

            const { platformFee, integratorFee } = await assertIntegratorFee(
                integrator,
                swapToken.address,
                totalInAmount
            );

            await collectTokenFees(platformFee, integratorFee, swapToken);
        });

        it('integrator fee works with native', async () => {
            const totalInAmount = BigNumber.from('5000' + '0'.repeat(18));
            await callProxy(totalInAmount, undefined, integrator);

            const { platformFee, integratorFee } = await assertIntegratorFee(
                integrator,
                ethers.constants.AddressZero,
                totalInAmount
            );

            await collectNativeFees(platformFee, integratorFee);
        });

        it('possible to collect integrator fee by owner', async () => {
            const totalInAmount = BigNumber.from('100000000');
            await callProxy(totalInAmount, transitToken, integrator);

            const { integratorFee } = await assertIntegratorFee(
                integrator,
                transitToken.address,
                totalInAmount
            );

            await proxy
                .connect(admin)
                ['collectIntegratorFee(address,address)'](transitToken.address, integrator);

            expect(await proxy.availableIntegratorFee(transitToken.address, integrator)).to.be.eq(
                '0'
            );
            expect(await transitToken.balanceOf(integrator)).to.be.eq(integratorFee);
        });
    });

    it('possible to transfer admin', async () => {
        assert.isTrue(await proxy.isAdmin(owner.address));

        await proxy.transferAdmin(admin.address);

        assert.isFalse(await proxy.isAdmin(owner.address));
        assert.isTrue(await proxy.isAdmin(admin.address));
    });
});
