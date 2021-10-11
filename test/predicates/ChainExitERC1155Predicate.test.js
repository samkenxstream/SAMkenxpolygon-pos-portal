import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiBN from 'chai-bn'
import BN from 'bn.js'
import { expectRevert } from '@openzeppelin/test-helpers'

import * as deployer from '../helpers/deployer'
import { mockValues } from '../helpers/constants'
import logDecoder from '../helpers/log-decoder.js'
import { constructERC1155DepositData } from '../helpers/utils'
import { getERC1155ChainExitLog } from '../helpers/logs'

// Enable and inject BN dependency
chai
    .use(chaiAsPromised)
    .use(chaiBN(BN))
    .should()

const should = chai.should()

contract('ChainExitERC1155Predicate', (accounts) => {
    describe('lockTokens', () => {
        const tokenIdA = mockValues.numbers[2]
        const tokenIdB = mockValues.numbers[7]
        const amountA = mockValues.amounts[0]
        const amountB = mockValues.amounts[1]
        const depositReceiver = mockValues.addresses[7]
        const depositor = accounts[1]
        const depositData = constructERC1155DepositData([tokenIdA, tokenIdB], [amountA, amountB])

        let dummyMintableERC1155
        let chainExitERC1155Predicate
        let lockTokensTx
        let lockedLog
        let oldAccountBalanceA
        let oldAccountBalanceB
        let oldContractBalanceA
        let oldContractBalanceB

        before(async () => {
            const contracts = await deployer.deployFreshRootContracts(accounts)
            dummyMintableERC1155 = contracts.dummyMintableERC1155
            chainExitERC1155Predicate = contracts.chainExitERC1155Predicate

            const PREDICATE_ROLE = await dummyMintableERC1155.PREDICATE_ROLE()
            await dummyMintableERC1155.grantRole(PREDICATE_ROLE, chainExitERC1155Predicate.address)

            await dummyMintableERC1155.mintBatch(depositor, [tokenIdA, tokenIdB], [amountA, amountB], '0x0')
            await dummyMintableERC1155.setApprovalForAll(chainExitERC1155Predicate.address, true, { from: depositor })

            oldAccountBalanceA = await dummyMintableERC1155.balanceOf(depositor, tokenIdA)
            oldAccountBalanceB = await dummyMintableERC1155.balanceOf(depositor, tokenIdB)
            oldContractBalanceA = await dummyMintableERC1155.balanceOf(chainExitERC1155Predicate.address, tokenIdA)
            oldContractBalanceB = await dummyMintableERC1155.balanceOf(chainExitERC1155Predicate.address, tokenIdB)
        })

        it('Depositor should have balance', () => {
            amountA.should.be.a.bignumber.at.most(oldAccountBalanceA)
            amountB.should.be.a.bignumber.at.most(oldAccountBalanceB)
        })

        it('Depositor should have approved token transfer', async () => {
            const approved = await dummyMintableERC1155.isApprovedForAll(depositor, chainExitERC1155Predicate.address)
            approved.should.equal(true)
        })

        it('Should be able to receive lockTokens tx', async () => {
            lockTokensTx = await chainExitERC1155Predicate.lockTokens(depositor, depositReceiver, dummyMintableERC1155.address, depositData)
            should.exist(lockTokensTx)
        })

        it('Should emit LockedBatchChainExitERC1155 log', () => {
            const logs = logDecoder.decodeLogs(lockTokensTx.receipt.rawLogs)
            lockedLog = logs.find(l => l.event === 'LockedBatchChainExitERC1155')
            should.exist(lockedLog)
        })

        describe('Correct values should be emitted in LockedBatchChainExitERC1155 log', () => {
            it('Event should be emitted by correct contract', () => {
                lockedLog.address.should.equal(
                    chainExitERC1155Predicate.address.toLowerCase()
                )
            })

            it('Should emit proper depositor', () => {
                lockedLog.args.depositor.should.equal(depositor)
            })

            it('Should emit proper deposit receiver', () => {
                lockedLog.args.depositReceiver.should.equal(depositReceiver)
            })

            it('Should emit proper root token', () => {
                lockedLog.args.rootToken.should.equal(dummyMintableERC1155.address)
            })

            it('Should emit proper token id for A', () => {
                const id = lockedLog.args.ids[0].toNumber()
                id.should.equal(tokenIdA)
            })

            it('Should emit proper token id for B', () => {
                const id = lockedLog.args.ids[1].toNumber()
                id.should.equal(tokenIdB)
            })

            it('Should emit proper amount for A', () => {
                const amounts = lockedLog.args.amounts
                const amount = new BN(amounts[0].toString())
                amount.should.be.a.bignumber.that.equals(amountA)
            })

            it('Should emit proper amount for B', () => {
                const amounts = lockedLog.args.amounts
                const amount = new BN(amounts[1].toString())
                amount.should.be.a.bignumber.that.equals(amountB)
            })
        })

        it('Deposit amount should be deducted from depositor account for A', async () => {
            const newAccountBalance = await dummyMintableERC1155.balanceOf(depositor, tokenIdA)
            newAccountBalance.should.be.a.bignumber.that.equals(
                oldAccountBalanceA.sub(amountA)
            )
        })

        it('Deposit amount should be deducted from depositor account for B', async () => {
            const newAccountBalance = await dummyMintableERC1155.balanceOf(depositor, tokenIdB)
            newAccountBalance.should.be.a.bignumber.that.equals(
                oldAccountBalanceB.sub(amountB)
            )
        })

        it('Deposit amount should be credited to correct contract for A', async () => {
            const newContractBalance = await dummyMintableERC1155.balanceOf(chainExitERC1155Predicate.address, tokenIdA)
            newContractBalance.should.be.a.bignumber.that.equals(
                oldContractBalanceA.add(amountA)
            )
        })

        it('Deposit amount should be credited to correct contract for B', async () => {
            const newContractBalance = await dummyMintableERC1155.balanceOf(chainExitERC1155Predicate.address, tokenIdB)
            newContractBalance.should.be.a.bignumber.that.equals(
                oldContractBalanceB.add(amountB)
            )
        })
    })

    describe('lockTokens called by non manager', () => {
        const tokenId = mockValues.numbers[5]
        const amount = mockValues.amounts[9]
        const depositData = constructERC1155DepositData([tokenId], [amount])
        const depositor = accounts[1]
        const depositReceiver = accounts[2]
        let dummyMintableERC1155
        let chainExitERC1155Predicate

        before(async () => {
            const contracts = await deployer.deployFreshRootContracts(accounts)
            dummyMintableERC1155 = contracts.dummyMintableERC1155
            chainExitERC1155Predicate = contracts.chainExitERC1155Predicate

            const PREDICATE_ROLE = await dummyMintableERC1155.PREDICATE_ROLE()
            await dummyMintableERC1155.grantRole(PREDICATE_ROLE, chainExitERC1155Predicate.address)

            await dummyMintableERC1155.mint(depositor, tokenId, amount, '0x0')
            await dummyMintableERC1155.setApprovalForAll(chainExitERC1155Predicate.address, true, { from: depositor })
        })

        it('Should revert with correct reason', async () => {
            await expectRevert(
                chainExitERC1155Predicate.lockTokens(depositor, depositReceiver, dummyMintableERC1155.address, depositData, { from: depositor }),
                'ChainExitERC1155Predicate: INSUFFICIENT_PERMISSIONS')
        })
    })

    describe('exitTokens', () => {
        // during deposit [(tokenIdA, amountA), (tokenIdB, amountB), (tokenIdC, amountC)]
        // pairing used & predicate should have whole balance
        //
        // during exit supplied burn log has [(tokenIdA, amountC), (tokenIdB, amountB), (tokenIdC, amountA)]
        // pairing
        //
        // Note, amountA = 1; amountB = 2; amountC = 5
        //
        // These combinations cover (almost) all cases !

        const amountA = mockValues.amounts[0]
        const tokenIdA = mockValues.numbers[0]

        const amountB = mockValues.amounts[1]
        const tokenIdB = mockValues.numbers[1]

        const amountC = mockValues.amounts[2]
        const tokenIdC = mockValues.numbers[2]

        const depositData = constructERC1155DepositData([tokenIdA, tokenIdB, tokenIdC], [amountA, amountB, amountC])
        const depositor = accounts[1]
        const withdrawer = mockValues.addresses[8]

        let dummyMintableERC1155
        let chainExitERC1155Predicate
        let exitTokensTx

        let oldAccountBalanceA
        let oldContractBalanceA
        let oldAccountBalanceB
        let oldContractBalanceB
        let oldAccountBalanceC
        let oldContractBalanceC

        before(async () => {
            const contracts = await deployer.deployFreshRootContracts(accounts)
            dummyMintableERC1155 = contracts.dummyMintableERC1155
            chainExitERC1155Predicate = contracts.chainExitERC1155Predicate

            const PREDICATE_ROLE = await dummyMintableERC1155.PREDICATE_ROLE()
            await dummyMintableERC1155.grantRole(PREDICATE_ROLE, chainExitERC1155Predicate.address)

            await dummyMintableERC1155.mint(depositor, tokenIdA, amountA, '0x0')
            await dummyMintableERC1155.mint(depositor, tokenIdB, amountB, '0x0')
            await dummyMintableERC1155.mint(depositor, tokenIdC, amountC, '0x0')

            await dummyMintableERC1155.setApprovalForAll(chainExitERC1155Predicate.address, true, { from: depositor })

            await chainExitERC1155Predicate.lockTokens(depositor, mockValues.addresses[2], dummyMintableERC1155.address, depositData)

            oldAccountBalanceA = await dummyMintableERC1155.balanceOf(withdrawer, tokenIdA)
            oldContractBalanceA = await dummyMintableERC1155.balanceOf(chainExitERC1155Predicate.address, tokenIdA)

            oldAccountBalanceB = await dummyMintableERC1155.balanceOf(withdrawer, tokenIdB)
            oldContractBalanceB = await dummyMintableERC1155.balanceOf(chainExitERC1155Predicate.address, tokenIdB)

            oldAccountBalanceC = await dummyMintableERC1155.balanceOf(withdrawer, tokenIdC)
            oldContractBalanceC = await dummyMintableERC1155.balanceOf(chainExitERC1155Predicate.address, tokenIdC)
        })

        it('Predicate should have all tokens', async () => {
            amountA.should.be.a.bignumber.at.most(oldContractBalanceA)
            amountB.should.be.a.bignumber.at.most(oldContractBalanceB)
            amountC.should.be.a.bignumber.at.most(oldContractBalanceC)
        })

        it('Withdrawer should have no tokens', async () => {
            oldAccountBalanceA.should.be.a.bignumber.at.most(new BN(0))
            oldAccountBalanceB.should.be.a.bignumber.at.most(new BN(0))
            oldAccountBalanceC.should.be.a.bignumber.at.most(new BN(0))
        })

        it('Should be able to receive exitTokens tx', async () => {
            const burnLog = getERC1155ChainExitLog({
                to: withdrawer,
                tokenIds: [tokenIdA, tokenIdB, tokenIdC],
                amounts: [amountC, amountB, amountA],
                data: 'Hello 👋'
            })

            exitTokensTx = await chainExitERC1155Predicate.exitTokens(withdrawer, dummyMintableERC1155.address, burnLog)
            should.exist(exitTokensTx)
        })

        it('Correct withdraw amount deduction & credit [tokenIdA]', async () => {
            const newContractBalanceA = await dummyMintableERC1155.balanceOf(chainExitERC1155Predicate.address, tokenIdA)
            newContractBalanceA.should.be.a.bignumber.that.equals(amountC.gte(oldContractBalanceA) ? new BN(0) : oldContractBalanceA.sub(amountC))

            const newAccountBalanceA = await dummyMintableERC1155.balanceOf(withdrawer, tokenIdA)
            newAccountBalanceA.should.be.a.bignumber.that.equals(oldAccountBalanceA.add(amountC))
        })

        it('Correct withdraw amount deduction & credit [tokenIdB]', async () => {
            const newContractBalanceB = await dummyMintableERC1155.balanceOf(chainExitERC1155Predicate.address, tokenIdB)
            newContractBalanceB.should.be.a.bignumber.that.equals(amountB.gte(oldContractBalanceB) ? new BN(0) : oldContractBalanceB.sub(amountB))

            const newAccountBalanceB = await dummyMintableERC1155.balanceOf(withdrawer, tokenIdB)
            newAccountBalanceB.should.be.a.bignumber.that.equals(oldAccountBalanceB.add(amountB))
        })

        it('Correct withdraw amount deduction & credit [tokenIdC]', async () => {
            const newContractBalanceC = await dummyMintableERC1155.balanceOf(chainExitERC1155Predicate.address, tokenIdC)
            newContractBalanceC.should.be.a.bignumber.that.equals(amountA.gte(oldContractBalanceC) ? new BN(0) : oldContractBalanceC.sub(amountA))

            const newAccountBalanceC = await dummyMintableERC1155.balanceOf(withdrawer, tokenIdC)
            newAccountBalanceC.should.be.a.bignumber.that.equals(oldAccountBalanceC.add(amountA))
        })
    })

    describe('exitTokens with real burn log', () => {
        const amount = mockValues.amounts[9]
        const tokenId = mockValues.numbers[4]
        const depositData = constructERC1155DepositData([tokenId], [amount])
        const depositor = accounts[1]
        const withdrawer = mockValues.addresses[8]

        let dummyMintableERC1155
        let chainExitERC1155Predicate

        before(async () => {
            const contracts = await deployer.deployFreshRootContracts(accounts)
            dummyMintableERC1155 = contracts.dummyMintableERC1155
            chainExitERC1155Predicate = contracts.chainExitERC1155Predicate

            const PREDICATE_ROLE = await dummyMintableERC1155.PREDICATE_ROLE()
            await dummyMintableERC1155.grantRole(PREDICATE_ROLE, chainExitERC1155Predicate.address)

            await dummyMintableERC1155.mint(depositor, tokenId, amount, '0x0')
            await dummyMintableERC1155.setApprovalForAll(chainExitERC1155Predicate.address, true, { from: depositor })

            await chainExitERC1155Predicate.lockTokens(depositor, mockValues.addresses[2], dummyMintableERC1155.address, depositData)
        })

        it('Should revert with correct reason', async () => {
            const burnLog = getERC1155ChainExitLog({
                to: mockValues.zeroAddress,
                tokenIds: [tokenId],
                amounts: [amount],
                data: 'Hello 👋'
            })
            await expectRevert(chainExitERC1155Predicate.exitTokens(withdrawer, dummyMintableERC1155.address, burnLog), 'ChainExitERC1155Predicate: INVALID_RECEIVER')
        })
    })

    describe('exitTokens with unsupported burn log', () => {
        const amount = mockValues.amounts[9]
        const tokenId = mockValues.numbers[4]
        const depositData = constructERC1155DepositData([tokenId], [amount])
        const depositor = accounts[1]
        const withdrawer = mockValues.addresses[8]

        let dummyMintableERC1155
        let chainExitERC1155Predicate

        before(async () => {
            const contracts = await deployer.deployFreshRootContracts(accounts)
            dummyMintableERC1155 = contracts.dummyMintableERC1155
            chainExitERC1155Predicate = contracts.chainExitERC1155Predicate

            const PREDICATE_ROLE = await dummyMintableERC1155.PREDICATE_ROLE()
            await dummyMintableERC1155.grantRole(PREDICATE_ROLE, chainExitERC1155Predicate.address)

            await dummyMintableERC1155.mint(depositor, tokenId, amount, '0x0')
            await dummyMintableERC1155.setApprovalForAll(chainExitERC1155Predicate.address, true, { from: depositor })

            await chainExitERC1155Predicate.lockTokens(depositor, mockValues.addresses[2], dummyMintableERC1155.address, depositData)
        })

        it('Should revert with correct reason', async () => {
            const burnLog = getERC1155ChainExitLog({
                overrideSig: mockValues.bytes32[2],
                to: withdrawer,
                tokenIds: [tokenId],
                amounts: [amount],
                data: 'Hello 👋'
            })
            await expectRevert(chainExitERC1155Predicate.exitTokens(withdrawer, dummyMintableERC1155.address, burnLog), 'ChainExitERC1155Predicate: INVALID_WITHDRAW_SIG')
        })
    })
})
