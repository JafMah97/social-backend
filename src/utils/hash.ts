import bcrypt from 'bcrypt'

// Number of salt rounds for hashing
const SALT_ROUNDS = 10

/**
 * Hashes a plain text password
 * @param password - The plain text password
 * @returns A hashed password string
 */
export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, SALT_ROUNDS)
}

/**
 * Compares a plain password with a hashed password
 * @param plain - The plain text password
 * @param hash - The hashed password from the database
 * @returns True if passwords match, false otherwise
 */
export const comparePassword = async (
  plain: string,
  hash: string,
): Promise<boolean> => {
  return bcrypt.compare(plain, hash)
}
