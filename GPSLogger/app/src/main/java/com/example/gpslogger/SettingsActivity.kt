package com.example.gpslogger
import android.os.Bundle
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.Spinner
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.edit

class SettingsActivity : AppCompatActivity() {

    private lateinit var spinnerFloor: Spinner
    private lateinit var spinnerBuilding: Spinner
    private lateinit var editInitialNode: EditText
    private lateinit var editInitialEdge: EditText

    private val floors = listOf("B", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10")
    private val buildings = listOf(
        "Outside",
        "60 West Charlton",               // 60WCHARL
        "Alms Building",                  // ALMS
        "Armory Fieldhouse",              // ARMORY
        "Aronoff Center",                 // ARONOFF
        "Arts & Sciences Hall",           // ARTSCI
        "Baldwin Hall",                   // BALDWIN
        "Blegen Library",                 // BLEGEN
        "Braunstein Hall",                // BRAUNSTN
        "Calhoun Hall",                  // CALHOUN
        "Corbett Cntr Perform Arts",     // CCPA
        "Clifton Court Hall",            // CLIFTCT
        "College of Law Building",       // COLLAW
        "Crosley Tower",                 // CROSLEY
        "DAAP Studio Annex",             // DAAPSTAN
        "Dabney Hall",                   // DABNEY
        "Daniels Hall",                  // DANIELS
        "Dieterle Vocal Arts Cntr",      // DIETERLE
        "Dyer Hall",                     // DYER
        "Edwards Center",                // EDWARDS
        "Emery Hall",                    // EMERY
        "French Hall",                   // FRENCH-W
        "Geology-Physics",               // GEOPHYS
        "Langsam Library",               // LANGSAM
        "Carl H. Lindner Hall",          // LINDHALL
        "Lindner Center",                // LNDNRCTR
        "Mantei Center",                 // MANTEI
        "MarketPointe at Siddall",       // MARKETPT
        "Memorial Hall",                 // MEMORIAL
        "Morgens Hall",                  // MORGENS
        "Marian Spencer Hall",           // MSPENCER
        "Nippert Stadium",               // NIPPERT
        "Old Chemistry Building",        // OLDCHEM
        "Campus Recreation Center",      // RECCENTR
        "Rhodes Hall",                   // RHODES
        "Rieveschl Hall",                // RIEVSCHL
        "Sheakley APC-IPF",              // SAPC-IPF
        "Schneider Hall",                // SCHNEIDR
        "Scioto Hall",                   // SCIOTO
        "Shoemaker Multipurp Cntr",      // SHOE
        "Siddall Hall",                  // SIDDALL
        "Steger Student Life Cntr",      // STEGER
        "Swift Hall",                    // SWIFT
        "Teachers College",              // TEACHERS
        "Trabert-Talbert Tennis",        // TENNISCT
        "Tangeman University Cntr",      // TUC
        "Turner Hall",                   // TURNER
        "University Pavilion",           // UNIVPAV
        "Van Wormer Hall",               // VANWORMR
        "Varsity Village Baseball",      // VVB
        "Wolfson Center",                // WOLFSON
        "Zimmer Hall"                    // ZIMMER
    )


    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)
        supportActionBar?.hide()

        supportActionBar?.title = "Settings"

        spinnerFloor = findViewById(R.id.spinnerFloor)
        spinnerBuilding = findViewById(R.id.spinnerBuilding)
        editInitialNode = findViewById(R.id.editInitialNode)
        editInitialEdge = findViewById(R.id.editInitialEdge)


        // setup adapters
        spinnerFloor.adapter = ArrayAdapter(
            this,
            android.R.layout.simple_spinner_item,
            floors
        ).also { it.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item) }

        spinnerBuilding.adapter = ArrayAdapter(
            this,
            android.R.layout.simple_spinner_item,
            buildings
        ).also { it.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item) }

        loadSettings()

        findViewById<Button>(R.id.btnSaveSettings).setOnClickListener {
            saveSettings()
            finish() // go back to main screen
        }
        findViewById<Button>(R.id.btnResetSettings).setOnClickListener {
            resetToDefaults()
        }

    }

    private fun resetToDefaults() {
        // Reset UI spinners to first/default positions
        spinnerFloor.setSelection(1)  // "B" or index 0
        spinnerBuilding.setSelection(0)  // "Outside"

        // Reset EditTexts to default values
        editInitialNode.setText(AppSettings.DEFAULT_INITIAL_NODE.toString())
        editInitialEdge.setText(AppSettings.DEFAULT_INITIAL_EDGE.toString())

        // Clear all SharedPreferences (removes saved settings)
        getSharedPreferences(AppSettings.PREFS_NAME, MODE_PRIVATE).edit { clear() }
    }


    private fun loadSettings() {
        val prefs = getSharedPreferences(AppSettings.PREFS_NAME, MODE_PRIVATE)

        val savedFloor = prefs.getString(AppSettings.KEY_FLOOR, AppSettings.DEFAULT_FLOOR)
        val savedBuilding = prefs.getString(AppSettings.KEY_BUILDING, AppSettings.DEFAULT_BUILDING)
        val savedInitialNode = prefs.getInt(
            AppSettings.KEY_INITIAL_NODE,
            AppSettings.DEFAULT_INITIAL_NODE
        )
        val savedInitialEdge = prefs.getInt(
            AppSettings.KEY_INITIAL_EDGE,
            AppSettings.DEFAULT_INITIAL_EDGE
        )

        // set spinner selections
        savedFloor?.let {
            val index = floors.indexOf(it)
            if (index >= 0) spinnerFloor.setSelection(index)
        }

        savedBuilding?.let {
            val index = buildings.indexOf(it)
            if (index >= 0) spinnerBuilding.setSelection(index)
        }

        editInitialNode.setText(savedInitialNode.toString())
        editInitialEdge.setText(savedInitialEdge.toString())
    }

    private fun saveSettings() {
        val floor = floors[spinnerFloor.selectedItemPosition]
        val building = buildings[spinnerBuilding.selectedItemPosition]

        val initialNode = editInitialNode.text.toString().toIntOrNull()
            ?: AppSettings.DEFAULT_INITIAL_NODE
        val initialEdge = editInitialEdge.text.toString().toIntOrNull()
            ?: AppSettings.DEFAULT_INITIAL_EDGE

        val prefs = getSharedPreferences(AppSettings.PREFS_NAME, MODE_PRIVATE)
        prefs.edit()
            .putString(AppSettings.KEY_FLOOR, floor)
            .putString(AppSettings.KEY_BUILDING, building)
            .putInt(AppSettings.KEY_INITIAL_NODE, initialNode)
            .putInt(AppSettings.KEY_INITIAL_EDGE, initialEdge)
            .apply()
    }
}
