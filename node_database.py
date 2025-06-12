import sqlite3

conn = sqlite3.connect('nodes.db')

cursor = conn.cursor()

cursor.execute("DROP TABLE IF EXISTS NODES")

table = """ CREATE TABLE NODES (
            )"""