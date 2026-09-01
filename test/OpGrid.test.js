const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("OpGrid", function () {
  let opGrid, owner, poster, operator, other;
  const PLATFORM_FEE = 300; // 3%

  beforeEach(async function () {
    [owner, poster, operator, other] = await ethers.getSigners();
    const OpGrid = await ethers.getContractFactory("OpGrid");
    opGrid = await OpGrid.deploy(PLATFORM_FEE);
    await opGrid.waitForDeployment();
  });

  describe("Mission Creation", function () {
    it("should create a mission with correct details", async function () {
      const reward = ethers.parseEther("1.0");
      await expect(
        opGrid.connect(poster).createMission("Test Mission", "Do something", { value: reward })
      ).to.emit(opGrid, "MissionCreated")
        .withArgs(0, poster.address, "Test Mission", reward);

      const mission = await opGrid.getMission(0);
      expect(mission.title).to.equal("Test Mission");
      expect(mission.description).to.equal("Do something");
      expect(mission.poster).to.equal(poster.address);
      expect(mission.reward).to.equal(reward);
      expect(mission.status).to.equal(0); // Open
      expect(await opGrid.getMissionCount()).to.equal(1);
    });

    it("should reject mission with zero reward", async function () {
      await expect(
        opGrid.connect(poster).createMission("Test", "Desc", { value: 0 })
      ).to.be.revertedWith("Reward required");
    });
  });

  describe("Mission Acceptance", function () {
    beforeEach(async function () {
      await opGrid.connect(poster).createMission("Mission", "Desc", { value: ethers.parseEther("1.0") });
    });

    it("should allow an operator to accept an open mission", async function () {
      await expect(opGrid.connect(operator).acceptMission(0))
        .to.emit(opGrid, "MissionAccepted")
        .withArgs(0, operator.address);

      const mission = await opGrid.getMission(0);
      expect(mission.operator).to.equal(operator.address);
      expect(mission.status).to.equal(1); // Active
    });

    it("should prevent poster from accepting own mission", async function () {
      await expect(
        opGrid.connect(poster).acceptMission(0)
      ).to.be.revertedWith("Poster cannot accept own mission");
    });
  });

  describe("Proof Submission", function () {
    beforeEach(async function () {
      await opGrid.connect(poster).createMission("Mission", "Desc", { value: ethers.parseEther("1.0") });
      await opGrid.connect(operator).acceptMission(0);
    });

    it("should allow operator to submit proof", async function () {
      await expect(opGrid.connect(operator).submitProof(0, "https://proof.link"))
        .to.emit(opGrid, "ProofSubmitted")
        .withArgs(0, operator.address, "https://proof.link");

      const mission = await opGrid.getMission(0);
      expect(mission.proof).to.equal("https://proof.link");
      expect(mission.status).to.equal(2); // Submitted
    });

    it("should prevent non-operator from submitting proof", async function () {
      await expect(
        opGrid.connect(other).submitProof(0, "proof")
      ).to.be.revertedWith("Only operator can submit proof");
    });
  });

  describe("Mission Approval", function () {
    it("should release reward minus fee on approval", async function () {
      const reward = ethers.parseEther("1.0");
      await opGrid.connect(poster).createMission("Mission", "Desc", { value: reward });
      await opGrid.connect(operator).acceptMission(0);
      await opGrid.connect(operator).submitProof(0, "proof");

      const operatorBalanceBefore = await ethers.provider.getBalance(operator.address);
      const tx = await opGrid.connect(poster).approveMission(0);
      await tx.wait();

      const expectedFee = reward * BigInt(PLATFORM_FEE) / 10000n;
      const expectedPayout = reward - expectedFee;

      const operatorBalanceAfter = await ethers.provider.getBalance(operator.address);
      expect(operatorBalanceAfter - operatorBalanceBefore).to.equal(expectedPayout);

      const mission = await opGrid.getMission(0);
      expect(mission.status).to.equal(3); // Completed

      expect(await opGrid.accumulatedFees()).to.equal(expectedFee);
    });

    it("should prevent non-poster from approving", async function () {
      await opGrid.connect(poster).createMission("Mission", "Desc", { value: ethers.parseEther("1.0") });
      await opGrid.connect(operator).acceptMission(0);
      await opGrid.connect(operator).submitProof(0, "proof");

      await expect(
        opGrid.connect(other).approveMission(0)
      ).to.be.revertedWith("Only poster can approve");
    });
  });

  describe("Mission Cancellation", function () {
    it("should refund reward on cancellation", async function () {
      const reward = ethers.parseEther("1.0");
      await opGrid.connect(poster).createMission("Mission", "Desc", { value: reward });

      const posterBalanceBefore = await ethers.provider.getBalance(poster.address);
      const tx = await opGrid.connect(poster).cancelMission(0);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      const posterBalanceAfter = await ethers.provider.getBalance(poster.address);
      expect(posterBalanceAfter + gasCost - posterBalanceBefore).to.equal(reward);

      const mission = await opGrid.getMission(0);
      expect(mission.status).to.equal(5); // Cancelled
    });

    it("should prevent cancellation of non-open missions", async function () {
      await opGrid.connect(poster).createMission("Mission", "Desc", { value: ethers.parseEther("1.0") });
      await opGrid.connect(operator).acceptMission(0);

      await expect(
        opGrid.connect(poster).cancelMission(0)
      ).to.be.revertedWith("Can only cancel open missions");
    });
  });

  describe("Access Control", function () {
    it("should allow only owner to withdraw fees", async function () {
      await expect(
        opGrid.connect(other).withdrawFees()
      ).to.be.revertedWithCustomError(opGrid, "OwnableUnauthorizedAccount");
    });

    it("should allow only owner to pause", async function () {
      await expect(
        opGrid.connect(other).pause()
      ).to.be.revertedWithCustomError(opGrid, "OwnableUnauthorizedAccount");
    });
  });

  describe("Rejection", function () {
    it("should allow poster to reject and operator to resubmit", async function () {
      await opGrid.connect(poster).createMission("Mission", "Desc", { value: ethers.parseEther("1.0") });
      await opGrid.connect(operator).acceptMission(0);
      await opGrid.connect(operator).submitProof(0, "bad proof");

      await expect(opGrid.connect(poster).rejectMission(0))
        .to.emit(opGrid, "MissionRejected")
        .withArgs(0);

      const mission = await opGrid.getMission(0);
      expect(mission.status).to.equal(1); // Back to Active
      expect(mission.proof).to.equal("");

      // Operator can resubmit
      await opGrid.connect(operator).submitProof(0, "better proof");
      const updated = await opGrid.getMission(0);
      expect(updated.status).to.equal(2); // Submitted again
    });
  });
});
