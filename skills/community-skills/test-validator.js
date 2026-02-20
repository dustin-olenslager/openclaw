#!/usr/bin/env node

/**
 * Test suite for Community Skills Validator
 */

const { CommunitySkillsValidator } = require('./validate-skill.js');

class ValidatorTests {
    constructor() {
        this.validator = new CommunitySkillsValidator();
        this.testsPassed = 0;
        this.testsFailed = 0;
    }

    async runTests() {
        console.log('🧪 Running Community Skills Validator Tests\n');

        await this.testFetchApprovedSkills();
        await this.testParseSkillsFromReadme();
        await this.testCalculateSafetyScore();
        await this.testValidateSkill();

        console.log('\n📊 Test Results:');
        console.log(`✅ Passed: ${this.testsPassed}`);
        console.log(`❌ Failed: ${this.testsFailed}`);
        
        if (this.testsFailed > 0) {
            process.exit(1);
        } else {
            console.log('\n🎉 All tests passed!');
        }
    }

    async testFetchApprovedSkills() {
        console.log('🔍 Testing: fetchApprovedSkills()');
        try {
            const skills = await this.validator.fetchApprovedSkills();
            this.assert(Array.isArray(skills), 'Should return an array');
            this.assert(skills.length > 0, 'Should return at least one skill');
            
            // Check first skill structure
            if (skills.length > 0) {
                const skill = skills[0];
                this.assert(typeof skill.name === 'string', 'Skill should have name');
                this.assert(typeof skill.owner === 'string', 'Skill should have owner');
                this.assert(typeof skill.repo === 'string', 'Skill should have repo');
                this.assert(typeof skill.url === 'string', 'Skill should have url');
            }
            
            console.log(`   ✅ Found ${skills.length} approved skills`);
        } catch (error) {
            this.fail(`fetchApprovedSkills failed: ${error.message}`);
        }
    }

    testParseSkillsFromReadme() {
        console.log('🔍 Testing: parseSkillsFromReadme()');
        
        const sampleReadme = `
# Awesome OpenClaw Skills

## Community Skills

- [weather-forecast](https://github.com/weather-dev/openclaw-weather) - Get weather forecasts
- [task-manager](https://github.com/productivity/openclaw-tasks) - Manage your tasks
- [crypto-prices](https://github.com/crypto-dev/price-tracker.git) - Track cryptocurrency prices
`;

        const skills = this.validator.parseSkillsFromReadme(sampleReadme);
        
        this.assert(skills.length === 3, `Should parse 3 skills, got ${skills.length}`);
        this.assert(skills[0].name === 'weather-forecast', 'First skill name should match');
        this.assert(skills[0].owner === 'weather-dev', 'First skill owner should match');
        this.assert(skills[0].repo === 'openclaw-weather', 'First skill repo should match');
        this.assert(skills[2].repo === 'price-tracker', 'Should remove .git suffix');
        
        console.log('   ✅ README parsing works correctly');
    }

    testCalculateSafetyScore() {
        console.log('🔍 Testing: calculateSafetyScore()');
        
        // High quality repo
        const highQualityRepo = {
            stargazers_count: 150,
            forks_count: 25,
            updated_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
            description: 'A well-maintained OpenClaw skill for weather forecasting',
            license: { name: 'MIT' }
        };
        
        const highScore = this.validator.calculateSafetyScore(highQualityRepo);
        this.assert(highScore >= 8, `High quality repo should score >= 8, got ${highScore}`);
        
        // Low quality repo
        const lowQualityRepo = {
            stargazers_count: 1,
            forks_count: 0,
            updated_at: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(), // 200 days ago
            description: 'Test',
            license: null
        };
        
        const lowScore = this.validator.calculateSafetyScore(lowQualityRepo);
        this.assert(lowScore <= 3, `Low quality repo should score <= 3, got ${lowScore}`);
        
        console.log('   ✅ Safety scoring works correctly');
    }

    async testValidateSkill() {
        console.log('🔍 Testing: validateSkill()');
        
        try {
            // Test with a skill that definitely won't exist
            const result = await this.validator.validateSkill('nonexistent-test-skill-12345');
            this.assert(!result.approved, 'Nonexistent skill should not be approved');
            this.assert(result.reason.includes('Not found'), 'Should provide appropriate reason');
            
            console.log('   ✅ Skill validation works correctly');
        } catch (error) {
            this.fail(`validateSkill failed: ${error.message}`);
        }
    }

    assert(condition, message) {
        if (condition) {
            this.testsPassed++;
        } else {
            this.fail(message);
        }
    }

    fail(message) {
        console.log(`   ❌ ${message}`);
        this.testsFailed++;
    }
}

// Run tests
if (require.main === module) {
    const tests = new ValidatorTests();
    tests.runTests().catch(console.error);
}