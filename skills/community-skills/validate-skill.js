#!/usr/bin/env node

/**
 * Community Skills Validator
 * Validates OpenClaw community skills against awesome-openclaw-skills repository
 */

const https = require('https');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

class CommunitySkillsValidator {
    constructor() {
        this.cacheFile = path.join(__dirname, 'approved-skills.json');
        this.auditLog = path.join(__dirname, 'audit.log');
        this.cacheTimeout = 60 * 60 * 1000; // 1 hour
        this.awesomeSkillsUrl = 'https://api.github.com/repos/VoltAgent/awesome-openclaw-skills/contents/README.md';
    }

    async fetchApprovedSkills() {
        try {
            // Check cache first
            const cache = await this.loadCache();
            if (cache && Date.now() - cache.timestamp < this.cacheTimeout) {
                console.log('📂 Using cached approved skills list');
                return cache.skills;
            }

            console.log('🌐 Fetching latest awesome-openclaw-skills list...');
            
            const readmeContent = await this.httpRequest(this.awesomeSkillsUrl);
            const readme = JSON.parse(readmeContent);
            const content = Buffer.from(readme.content, 'base64').toString('utf-8');
            
            // Parse skills from README markdown
            const skills = this.parseSkillsFromReadme(content);
            
            // Cache the results
            await this.saveCache(skills);
            
            console.log(`✅ Found ${skills.length} approved community skills`);
            return skills;
            
        } catch (error) {
            console.error('❌ Failed to fetch approved skills:', error.message);
            
            // Try to use stale cache as fallback
            const cache = await this.loadCache();
            if (cache) {
                console.log('⚠️  Using stale cached skills list as fallback');
                return cache.skills;
            }
            
            throw new Error('Cannot validate skills - no approved list available');
        }
    }

    parseSkillsFromReadme(content) {
        const skills = [];
        const lines = content.split('\n');
        
        for (const line of lines) {
            // Look for GitHub links in markdown format: [skill-name](https://github.com/...)
            const match = line.match(/\[([^\]]+)\]\(https:\/\/github\.com\/([^\/]+)\/([^)]+)\)/);
            if (match) {
                const [, name, owner, repo] = match;
                skills.push({
                    name: name.toLowerCase().trim(),
                    owner,
                    repo: repo.replace(/\.git$/, ''), // Remove .git suffix if present
                    url: `https://github.com/${owner}/${repo}`,
                    parsedFrom: line.trim()
                });
            }
        }
        
        return skills;
    }

    async validateSkill(skillName) {
        const normalizedName = skillName.toLowerCase().trim();
        
        try {
            const approvedSkills = await this.fetchApprovedSkills();
            const skill = approvedSkills.find(s => 
                s.name === normalizedName || 
                s.repo.toLowerCase() === normalizedName ||
                s.repo.toLowerCase().includes(normalizedName)
            );
            
            if (!skill) {
                await this.logAttempt(skillName, 'REJECTED', 'Not found in awesome-openclaw-skills');
                return {
                    approved: false,
                    reason: 'Not found in awesome-openclaw-skills repository',
                    skill: null
                };
            }

            // Get additional repository information
            const repoInfo = await this.fetchRepoInfo(skill.owner, skill.repo);
            skill.repoInfo = repoInfo;
            
            const safetyScore = this.calculateSafetyScore(repoInfo);
            skill.safetyScore = safetyScore;
            
            return {
                approved: true,
                skill,
                safetyScore
            };
            
        } catch (error) {
            await this.logAttempt(skillName, 'ERROR', error.message);
            throw error;
        }
    }

    async fetchRepoInfo(owner, repo) {
        try {
            const url = `https://api.github.com/repos/${owner}/${repo}`;
            const data = await this.httpRequest(url);
            return JSON.parse(data);
        } catch (error) {
            console.warn(`⚠️  Could not fetch repository info for ${owner}/${repo}`);
            return {};
        }
    }

    calculateSafetyScore(repoInfo) {
        if (!repoInfo || !repoInfo.stargazers_count) return 0;
        
        let score = 0;
        
        // Stars (max 3 points)
        if (repoInfo.stargazers_count >= 100) score += 3;
        else if (repoInfo.stargazers_count >= 20) score += 2;
        else if (repoInfo.stargazers_count >= 5) score += 1;
        
        // Forks (max 2 points) 
        if (repoInfo.forks_count >= 10) score += 2;
        else if (repoInfo.forks_count >= 2) score += 1;
        
        // Recent activity (max 3 points)
        const lastUpdate = new Date(repoInfo.updated_at);
        const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceUpdate <= 30) score += 3;
        else if (daysSinceUpdate <= 90) score += 2;
        else if (daysSinceUpdate <= 180) score += 1;
        
        // Has description (max 1 point)
        if (repoInfo.description && repoInfo.description.length > 10) score += 1;
        
        // Has license (max 1 point)
        if (repoInfo.license) score += 1;
        
        return score;
    }

    async promptInstallation(skill, safetyScore) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        console.log(`\n✅ APPROVED: ${skill.name} found in awesome-openclaw-skills`);
        console.log(`📊 Repository: ${skill.url}`);
        
        if (skill.repoInfo) {
            console.log(`⭐ Stars: ${skill.repoInfo.stargazers_count || 0} | ` +
                       `🍴 Forks: ${skill.repoInfo.forks_count || 0} | ` +
                       `🔄 Updated: ${skill.repoInfo.updated_at?.split('T')[0] || 'Unknown'}`);
        }
        
        const safetyLevel = safetyScore >= 7 ? 'Excellent' : 
                           safetyScore >= 5 ? 'Good' : 
                           safetyScore >= 3 ? 'Fair' : 'Low';
        const safetyIcon = safetyScore >= 7 ? '🛡️' : 
                          safetyScore >= 5 ? '🔒' : 
                          safetyScore >= 3 ? '⚠️' : '🚨';
        
        console.log(`${safetyIcon} Safety Score: ${safetyScore}/10 (${safetyLevel})`);
        
        console.log(`\n⚠️  COMMUNITY SKILL WARNING:`);
        console.log(`This skill is from an external developer. Review the code before installation.`);
        console.log(`Repository: ${skill.url}`);
        
        return new Promise((resolve) => {
            rl.question(`\nInstall ${skill.name}? (y/N): `, (answer) => {
                rl.close();
                const confirmed = answer.toLowerCase().trim() === 'y' || answer.toLowerCase().trim() === 'yes';
                resolve(confirmed);
            });
        });
    }

    async logAttempt(skillName, result, reason, userConfirmed = false) {
        const timestamp = new Date().toISOString();
        const logEntry = `${timestamp} | ${skillName} | ${result} | ${reason} | User: ${userConfirmed}\n`;
        
        try {
            await fs.appendFile(this.auditLog, logEntry);
        } catch (error) {
            console.warn('Could not write to audit log:', error.message);
        }
    }

    async loadCache() {
        try {
            const data = await fs.readFile(this.cacheFile, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            return null;
        }
    }

    async saveCache(skills) {
        const cache = {
            timestamp: Date.now(),
            skills
        };
        
        try {
            await fs.writeFile(this.cacheFile, JSON.stringify(cache, null, 2));
        } catch (error) {
            console.warn('Could not save skills cache:', error.message);
        }
    }

    httpRequest(url) {
        return new Promise((resolve, reject) => {
            const options = {
                headers: {
                    'User-Agent': 'OpenClaw-Community-Skills-Validator/1.0',
                    'Accept': 'application/vnd.github.v3+json'
                }
            };

            https.get(url, options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(data);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                });
            }).on('error', reject);
        });
    }
}

// CLI Interface
async function main() {
    const skillName = process.argv[2];
    
    if (!skillName) {
        console.error('Usage: node validate-skill.js <skill-name>');
        process.exit(1);
    }
    
    const validator = new CommunitySkillsValidator();
    
    try {
        console.log(`🔍 Validating community skill: ${skillName}`);
        
        const result = await validator.validateSkill(skillName);
        
        if (!result.approved) {
            console.error(`❌ REJECTED: ${result.reason}`);
            console.error(`\n🏗️  BUILD YOUR OWN: Community skills are the exception, not the rule.`);
            console.error(`Consider creating this skill yourself for better security and control.`);
            process.exit(1);
        }
        
        const userConfirmed = await validator.promptInstallation(result.skill, result.safetyScore);
        
        if (userConfirmed) {
            await validator.logAttempt(skillName, 'APPROVED', 'User confirmed installation', true);
            console.log(`\n✅ Installation approved for ${skillName}`);
            console.log(`📂 Repository: ${result.skill.url}`);
            console.log(`\n⚠️  Remember to review the code before running!`);
            process.exit(0);
        } else {
            await validator.logAttempt(skillName, 'DECLINED', 'User declined installation', false);
            console.log(`\n❌ Installation cancelled by user`);
            process.exit(1);
        }
        
    } catch (error) {
        console.error(`\n💥 Validation failed:`, error.message);
        process.exit(1);
    }
}

// Export for programmatic use
module.exports = { CommunitySkillsValidator };

// Run CLI if called directly
if (require.main === module) {
    main().catch(console.error);
}