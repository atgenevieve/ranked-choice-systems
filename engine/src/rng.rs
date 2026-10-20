//! Seeded random numbers (xoshiro256** seeded by splitmix64), so every run is repeatable.

pub struct Rng(u64, u64, u64, u64);

fn splitmix(x: &mut u64) -> u64 {
    *x = x.wrapping_add(0x9E3779B97F4A7C15);
    let mut z = *x;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
    z ^ (z >> 31)
}

impl Rng {
    pub fn new(seed: u64) -> Self {
        let mut s = seed;
        Rng(splitmix(&mut s), splitmix(&mut s), splitmix(&mut s), splitmix(&mut s))
    }
    pub fn next_u64(&mut self) -> u64 {
        let r = (self.1.wrapping_mul(5)).rotate_left(7).wrapping_mul(9);
        let t = self.1 << 17;
        self.2 ^= self.0;
        self.3 ^= self.1;
        self.1 ^= self.2;
        self.0 ^= self.3;
        self.2 ^= t;
        self.3 = self.3.rotate_left(45);
        r
    }
    pub fn f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 * (1.0 / (1u64 << 53) as f64)
    }
    pub fn gauss(&mut self) -> f64 {
        let mut u = self.f64();
        while u <= 0.0 {
            u = self.f64();
        }
        let v = self.f64();
        (-2.0 * u.ln()).sqrt() * (2.0 * std::f64::consts::PI * v).cos()
    }
}
