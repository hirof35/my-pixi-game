import * as PIXI from 'pixi.js';
import { gsap } from 'gsap';
import bossUrl from './assets/boss.png';
import enemyUrl from './assets/enemy.png';
import playerUrl from './assets/player.png';

// --- 型定義と定数 ---
enum GameState { TITLE, PLAYING, BOSS_BATTLE, CLEAR }

interface Particle {
    display: PIXI.Graphics;
    vx: number;
    vy: number;
    life: number;
    decay: number;
}

interface EnemyBullet {
    sprite: PIXI.Graphics;
    vx: number;
    vy: number;
}

// --- メインゲームクラス ---
class ShootingGame {
    private app: PIXI.Application;
    private state: GameState = GameState.TITLE;
    private keys: Record<string, boolean> = {};
    
    // スコア・ステータス
    private score: number = 0;
    private killCount: number = 0;
    private playerHp: number = 3;
    private bossHp: number = 20;
    private shotTimer: number = 0;

    // コンテナ
    private sceneContainer: PIXI.Container;
    private bulletContainer: PIXI.Container;
    private enemyBulletContainer: PIXI.Container;
    private enemyContainer: PIXI.Container;
    private particleContainer: PIXI.Container;
    
    // UI
    private hpText!: PIXI.Text;

    // エンティティ
    private player!: PIXI.Sprite;
    private enemies: PIXI.Sprite[] = [];
    private bullets: PIXI.Graphics[] = [];
    private enemyBullets: EnemyBullet[] = [];
    private particles: Particle[] = [];
    private boss: PIXI.Sprite | null = null;

    constructor() {
        this.app = new PIXI.Application();
        this.sceneContainer = new PIXI.Container();
        this.bulletContainer = new PIXI.Container();
        this.enemyBulletContainer = new PIXI.Container();
        this.enemyContainer = new PIXI.Container();
        this.particleContainer = new PIXI.Container();

        window.addEventListener('keydown', (e) => this.keys[e.code] = true);
        window.addEventListener('keyup', (e) => this.keys[e.code] = false);
    }

    async init() {
        await this.app.init({ width: 800, height: 600, backgroundColor: 0x050505 });
        document.body.appendChild(this.app.canvas);
        
        try {
            await PIXI.Assets.load([
                { alias: 'player', src: playerUrl },
                { alias: 'enemy', src: enemyUrl },
                { alias: 'boss', src: bossUrl }
            ]);
        } catch (e) {
            console.error("Asset Load Error:", e);
        }
        
        this.app.stage.addChild(this.sceneContainer);
        this.showTitle();
        this.app.ticker.add((ticker) => this.update(ticker.deltaTime));
    }

    private showTitle() {
        this.state = GameState.TITLE;
        this.sceneContainer.removeChildren();
        
        const titleText = new PIXI.Text({ 
            text: 'PIXI SHOOTER\nClick to Start', 
            style: { fill: 0xffffff, align: 'center', fontSize: 40 } 
        });
        titleText.anchor.set(0.5);
        titleText.x = 400; titleText.y = 300;
        
        this.sceneContainer.addChild(titleText);
        this.app.canvas.addEventListener('click', () => this.startGame(), { once: true });
    }

    private startGame() {
        this.state = GameState.PLAYING;
        this.sceneContainer.removeChildren();
        
        // リセット
        this.killCount = 0;
        this.score = 0;
        this.playerHp = 3;
        this.enemies = [];
        this.bullets = [];
        this.enemyBullets = [];
        this.particles = [];
        this.boss = null;

        // プレイヤー生成
        this.player = PIXI.Sprite.from('player');
        this.player.anchor.set(0.5);
        this.player.scale.set(0.15);
        this.player.x = 400; this.player.y = 500;

        // UI
        this.hpText = new PIXI.Text({ text: `HP: ${this.playerHp}`, style: { fill: 0xffffff, fontSize: 20 } });
        this.hpText.x = 20; this.hpText.y = 20;
        
        this.sceneContainer.addChild(
            this.bulletContainer, 
            this.enemyBulletContainer, 
            this.enemyContainer, 
            this.particleContainer, 
            this.player,
            this.hpText
        );
    }

    private update(delta: number) {
        if (this.state === GameState.TITLE || this.state === GameState.CLEAR) return;

        // 1. 自機の移動
        const pSpeed = 5 * delta;
        if (this.keys['ArrowLeft']) this.player.x -= pSpeed;
        if (this.keys['ArrowRight']) this.player.x += pSpeed;
        if (this.keys['ArrowUp']) this.player.y -= pSpeed;
        if (this.keys['ArrowDown']) this.player.y += pSpeed;

        // 2. 弾の発射
        this.shotTimer += delta;
        if (this.keys['Space'] && this.shotTimer > 15) {
            this.shoot();
            this.shotTimer = 0;
        }

        // 3. 敵の生成 (PLAYING中のみ)
        if (this.state === GameState.PLAYING && Math.random() < 0.02) this.spawnEnemy();

        // 4. 自機の弾の移動
        this.bullets.forEach((b, i) => {
            b.y -= 10 * delta;
            if (b.y < -10) {
                this.bulletContainer.removeChild(b);
                this.bullets.splice(i, 1);
            }
        });

        // 5. 敵の弾の移動 & プレイヤーへの当たり判定
        this.enemyBullets.forEach((bObj, i) => {
            bObj.sprite.x += bObj.vx * delta;
            bObj.sprite.y += bObj.vy * delta;

            const dist = Math.hypot(this.player.x - bObj.sprite.x, this.player.y - bObj.sprite.y);
            if (dist < 20) {
                this.damagePlayer(bObj, i);
            }

            if (bObj.sprite.y > 600 || bObj.sprite.y < -50) {
                this.enemyBulletContainer.removeChild(bObj.sprite);
                this.enemyBullets.splice(i, 1);
            }
        });

        // 6. 敵の移動 & 弾との当たり判定
        this.enemies.forEach((e, ei) => {
            e.y += 2 * delta;
            if (Math.random() < 0.01) this.createEnemyBullet(e.x, e.y);

            this.bullets.forEach((b, bi) => {
                const dist = Math.hypot(e.x - b.x, e.y - b.y);
                if (dist < 30) {
                    this.createExplosion(e.x, e.y, 0xff5500);
                    this.enemyContainer.removeChild(e);
                    this.enemies.splice(ei, 1);
                    this.bulletContainer.removeChild(b);
                    this.bullets.splice(bi, 1);
                    this.killCount++;
                }
            });
        });

        // 7. ボスの更新 & 当たり判定
        if (this.state === GameState.PLAYING && this.killCount >= 10) this.spawnBoss();
        if (this.state === GameState.BOSS_BATTLE && this.boss) {
            if (this.app.ticker.lastTime % 60 < 1) {
                this.createEnemyBullet(this.boss.x, this.boss.y, -2);
                this.createEnemyBullet(this.boss.x, this.boss.y, 0);
                this.createEnemyBullet(this.boss.x, this.boss.y, 2);
            }
            this.bullets.forEach((b, bi) => {
                const dist = Math.hypot(this.boss!.x - b.x, this.boss!.y - b.y);
                if (dist < 50) {
                    this.bulletContainer.removeChild(b);
                    this.bullets.splice(bi, 1);
                    this.damageBoss();
                }
            });
        }

        // 8. パーティクルの更新
        this.particles.forEach((p, i) => {
            p.display.x += p.vx * delta;
            p.display.y += p.vy * delta;
            p.life -= p.decay * delta;
            p.display.alpha = p.life;
            if (p.life <= 0) {
                this.particleContainer.removeChild(p.display);
                this.particles.splice(i, 1);
            }
        });
    }

    private shoot() {
        const b = new PIXI.Graphics().rect(-2, -10, 4, 20).fill(0xffff00);
        b.x = this.player.x; b.y = this.player.y;
        this.bulletContainer.addChild(b);
        this.bullets.push(b);
    }

    private createEnemyBullet(x: number, y: number, vx: number = 0) {
        const s = new PIXI.Graphics().circle(0, 0, 5).fill(0xff00ff);
        s.x = x; s.y = y;
        this.enemyBulletContainer.addChild(s);
        this.enemyBullets.push({ sprite: s, vx: vx, vy: 4 });
    }

    private spawnEnemy() {
        const e = PIXI.Sprite.from('enemy');
        e.anchor.set(0.5); e.scale.set(0.15); e.tint = 0xff0000;
        e.x = Math.random() * 800; e.y = -50;
        this.enemyContainer.addChild(e);
        this.enemies.push(e);
    }

    private spawnBoss() {
        this.state = GameState.BOSS_BATTLE;
        this.boss = PIXI.Sprite.from('boss');
        this.boss.anchor.set(0.5); this.boss.scale.set(0.5); this.boss.tint = 0xffaa00;
        this.boss.x = 400; this.boss.y = -100;
        this.enemyContainer.addChild(this.boss);
        this.bossHp = 20;
        gsap.to(this.boss, { y: 150, duration: 2, ease: "bounce.out" });
    }

    private damagePlayer(bObj: EnemyBullet, i: number) {
        this.enemyBulletContainer.removeChild(bObj.sprite);
        this.enemyBullets.splice(i, 1);
        this.playerHp--;
        this.hpText.text = `HP: ${this.playerHp}`;
        this.createExplosion(this.player.x, this.player.y, 0xffffff);
        gsap.to(this.player, { pixi: { tint: 0xff0000 }, duration: 0.1, yoyo: true, repeat: 3 });
        if (this.playerHp <= 0) this.gameOver();
    }

    private damageBoss() {
        if (!this.boss) return;
        this.bossHp--;
        this.createExplosion(this.boss.x, this.boss.y, 0xffff00);
        gsap.to(this.boss, { pixi: { tint: 0xffffff }, duration: 0.05, yoyo: true, repeat: 1 });
        if (this.bossHp <= 0) this.gameClear();
    }

    private createExplosion(x: number, y: number, color: number) {
        for (let i = 0; i < 10; i++) {
            const g = new PIXI.Graphics().rect(-2, -2, 4, 4).fill(color);
            g.x = x; g.y = y;
            const angle = Math.random() * Math.PI * 2;
            const spd = Math.random() * 5 + 2;
            this.particles.push({
                display: g, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
                life: 1.0, decay: 0.03
            });
            this.particleContainer.addChild(g);
        }
    }

    private gameOver() {
        this.state = GameState.CLEAR;
        alert("GAME OVER");
        this.showTitle();
    }

    private gameClear() {
        this.state = GameState.CLEAR;
        if (this.boss) {
            gsap.to(this.boss, { alpha: 0, scale: 2, duration: 1, onComplete: () => {
                alert("CONGRATULATIONS! MISSION COMPLETE");
                this.showTitle();
            }});
        }
    }
}

new ShootingGame().init();