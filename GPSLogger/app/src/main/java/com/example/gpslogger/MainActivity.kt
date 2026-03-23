package com.example.gpslogger

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.net.Uri
import android.widget.Button
import android.widget.TextView
import android.os.CountDownTimer
import android.widget.Toast
import androidx.core.app.ActivityCompat
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import org.json.JSONArray
import org.json.JSONObject
import com.google.android.gms.maps.MapView
import com.google.android.gms.maps.OnMapReadyCallback
import com.google.android.gms.maps.GoogleMap
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.MarkerOptions
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.graphics.Color
import android.widget.CheckBox
import com.google.android.gms.maps.model.PolylineOptions
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import android.content.Context


// Normalized node (DB-ready)
data class Node(
    val nodeId: String,
    val latitude: Double,
    val longitude: Double,
    val elevationM: Double?,
    val location: String,
    val floorCode: String,
    val entrance: Boolean = false,
    val elevator: Boolean = false,
    val staircase: Boolean = false
)

// Edge connecting two nodes (explicit graph connectivity)
data class Edge(
    val edgeId: String,
    val fromNodeId: String,
    val toNodeId: String,
    val bidirectional: Boolean = true,
    val edgeType: String = "walkway",
    val accessible: Boolean = true
)

object AppSettings {
    const val PREFS_NAME = "ucnavvy_settings"
    const val KEY_FLOOR = "floor"
    const val KEY_BUILDING = "building"
    const val KEY_INITIAL_NODE = "initial_node"

    const val DEFAULT_FLOOR = "0"
    const val DEFAULT_BUILDING = "Outside"
    const val DEFAULT_INITIAL_NODE = 1

    const val KEY_INITIAL_EDGE = "initial_edge"
    const val DEFAULT_INITIAL_EDGE = 1

    var currentFloor: String = DEFAULT_FLOOR
    var currentBuilding: String = DEFAULT_BUILDING
    var initialNodeNumber: Int = DEFAULT_INITIAL_NODE
    var initialEdgeNumber: Int = DEFAULT_INITIAL_EDGE

    fun load(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        currentFloor = prefs.getString(KEY_FLOOR, DEFAULT_FLOOR) ?: DEFAULT_FLOOR
        currentBuilding = prefs.getString(KEY_BUILDING, DEFAULT_BUILDING) ?: DEFAULT_BUILDING
        initialNodeNumber = prefs.getInt(KEY_INITIAL_NODE, DEFAULT_INITIAL_NODE)
        initialEdgeNumber = prefs.getInt(KEY_INITIAL_EDGE, DEFAULT_INITIAL_EDGE)
    }
}


class MainActivity : AppCompatActivity(), OnMapReadyCallback {
    private lateinit var mapView: MapView
    private var googleMap: GoogleMap? = null
    private val MAP_VIEW_BUNDLE_KEY = "MapViewBundleKey"

    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private val CREATE_FILE_REQUEST_CODE = 1002

    // Root JSON object that will contain "nodes" and "edges"
    private var gpsRootObject = JSONObject()
    private var jsonFileUri: Uri? = null

    private lateinit var nodeAdapter: NodeAdapter
    private val nodes: MutableList<Node> = mutableListOf()
    private val edges: MutableList<Edge> = mutableListOf()

    private var selectedNodeIndex = -1
    private var nodeCounter = 1
    private var edgeCounter = 1

    // Path recording state (for automatic edges along paths)
    private var isRecordingPath: Boolean = false
    private var lastPathNodeId: String? = null

    // Manual connect state (for precise indoors connections)
    private var pendingFromNodeId: String? = null
    // Connect button state machine
    private var connectMode = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        supportActionBar?.hide()

        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        val locationTextView = findViewById<TextView>(R.id.tv_location)
        val button = findViewById<Button>(R.id.btn_log_location)
        val recyclerView = findViewById<RecyclerView>(R.id.recycler_nodes)

        val recordPathButton = findViewById<Button>(R.id.btn_record_path)
        val connectButton = findViewById<Button>(R.id.btn_connect_nodes)

        // MapView setup
        var mapViewBundle: Bundle? = null
        if (savedInstanceState != null) {
            mapViewBundle = savedInstanceState.getBundle(MAP_VIEW_BUNDLE_KEY)
        }
        mapView = findViewById(R.id.mapView)
        mapView.onCreate(mapViewBundle)
        mapView.getMapAsync(this)

        // RecyclerView setup: select node -> update map + set as pendingFromNodeId
        nodeAdapter = NodeAdapter(nodes, selectedNodeIndex) { node, index ->
            selectedNodeIndex = index
            redrawGraphOnMap(selected = node)
            if (connectMode) {
                // First or second node for connect
                if (pendingFromNodeId == null) {
                    pendingFromNodeId = node.nodeId
                    Toast.makeText(this, "Start node: ${node.nodeId}. Now tap the second node.", Toast.LENGTH_SHORT).show()
                } else {
                    // We have from + to; connect and exit mode
                    connectPendingToSelected()
                    connectMode = false
                }
            } else {
                // Normal selection behavior (no connect mode)
                redrawGraphOnMap(selected = node)
            }
        }
        recyclerView.layoutManager = LinearLayoutManager(this)
        recyclerView.adapter = nodeAdapter

        // Save a new node (and possibly an edge if recording)
        button.setOnClickListener {
            getCurrentLocation(locationTextView, recyclerView)
        }

        val selectFileButton = findViewById<Button>(R.id.btn_select_file)
        selectFileButton.setOnClickListener {
            val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "application/json"
                putExtra(Intent.EXTRA_TITLE, "gps_data.json")
            }
            startActivityForResult(intent, CREATE_FILE_REQUEST_CODE)
        }

        // Toggle path recording mode (automatic sequential edges)
        recordPathButton.setOnClickListener {
            isRecordingPath = !isRecordingPath
            if (isRecordingPath) {
                lastPathNodeId = null
                recordPathButton.text = "Stop Path"
                Toast.makeText(this, "Path recording started", Toast.LENGTH_SHORT).show()
            } else {
                lastPathNodeId = null
                recordPathButton.text = "Start Path"
                Toast.makeText(this, "Path recording stopped", Toast.LENGTH_SHORT).show()
            }
        }

        // Manually connect pendingFromNodeId -> currently selected node
        connectButton.setOnClickListener {
            if (!connectMode) {
                connectMode = true
                pendingFromNodeId = null
                Toast.makeText(this, "Connect mode: tap first node in the list.", Toast.LENGTH_SHORT).show()
            } else {
                // Cancel connect mode on second press
                connectMode = false
                pendingFromNodeId = null
                Toast.makeText(this, "Connect cancelled.", Toast.LENGTH_SHORT).show()
            }
        }
        val deleteButton = findViewById<Button>(R.id.btn_delete_node)

        deleteButton.setOnClickListener {
            deleteSelectedNode()
        }
        findViewById<Button>(R.id.btnSettings).setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }

        // load settings and apply initial nodeCounter
        applySettings()
    }
    private fun applySettings() {
        /*
        val prefs = getSharedPreferences(AppSettings.PREFS_NAME, MODE_PRIVATE)
        val initialNode = prefs.getInt(
            AppSettings.KEY_INITIAL_NODE,
            AppSettings.DEFAULT_INITIAL_NODE
        )

        // only use the initial node if we have no nodes yet
        if (nodes.isEmpty()) {
            nodeCounter = initialNode
        }*/
        AppSettings.load(this)  // ← LOADS ALL 3 SETTINGS
        if (nodes.isEmpty()) {
            nodeCounter = AppSettings.initialNodeNumber  // Now uses loaded value
        }
        if (edges.isEmpty()) {
            edgeCounter = AppSettings.initialEdgeNumber  // ← NEW
        }
    }
    override fun onMapReady(map: GoogleMap) {
        googleMap = map
        val defaultLatLng = LatLng(39.1338, -84.5165)
        googleMap?.moveCamera(CameraUpdateFactory.newLatLngZoom(defaultLatLng, 15f))
    }

    override fun onResume() { super.onResume(); mapView.onResume() }
    override fun onStart() { super.onStart(); mapView.onStart() }
    override fun onStop() { super.onStop(); mapView.onStop() }
    override fun onPause() { mapView.onPause(); super.onPause() }
    override fun onDestroy() { mapView.onDestroy(); super.onDestroy() }
    override fun onLowMemory() { super.onLowMemory(); mapView.onLowMemory() }
    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        var mapViewBundle = outState.getBundle(MAP_VIEW_BUNDLE_KEY)
        if (mapViewBundle == null) {
            mapViewBundle = Bundle()
            outState.putBundle(MAP_VIEW_BUNDLE_KEY, mapViewBundle)
        }
        mapView.onSaveInstanceState(mapViewBundle)
    }

    // Collect normalized node + edges into in-memory graph and write to JSON file
    private fun getCurrentLocation(locationTextView: TextView, recyclerView: RecyclerView) {
        val button = findViewById<Button>(R.id.btn_log_location)
        if (ActivityCompat.checkSelfPermission(
                this,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION),
                1001
            )
            return
        }
        button.isEnabled = false
        button.alpha = 0.5f

        fusedLocationClient.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null)
            .addOnSuccessListener { location: Location? ->
                if (location != null) {
                    locationTextView.text =
                        "Lat: ${location.latitude}, Lon: ${location.longitude}, Alt: ${location.altitude}"

                    // TODO: replace with real building/floor mapping logic
                    AppSettings.load(this)
                    val floorCode = AppSettings.currentFloor
                    val locTag = AppSettings.currentBuilding

                    // Optional: read checkboxes if you add them in layout
                    val entranceBox = findViewById<CheckBox?>(R.id.checkbox_entrance)
                    val elevatorBox = findViewById<CheckBox?>(R.id.checkbox_elevator)
                    val staircaseBox = findViewById<CheckBox?>(R.id.checkbox_staircase)

                    val isEntrance = entranceBox?.isChecked ?: false
                    val isElevator = elevatorBox?.isChecked ?: false
                    val isStaircase = staircaseBox?.isChecked ?: false

                    val nodeId = "$nodeCounter"
                    nodeCounter++

                    val node = Node(
                        nodeId = nodeId,
                        latitude = location.latitude,
                        longitude = location.longitude,
                        elevationM = location.altitude,
                        location = locTag,
                        floorCode = floorCode,
                        entrance = isEntrance,
                        elevator = isElevator,
                        staircase = isStaircase
                    )

                    nodes.add(node)
                    selectedNodeIndex = nodes.size - 1
                    redrawGraphOnMap(selected = node)
                    nodeAdapter.updateNodes(nodes, selectedNodeIndex)
                    redrawGraphOnMap(node)
                    recyclerView.scrollToPosition(nodes.size - 1)

                    // If recording, add an edge from the previous path node to this node
                    if (isRecordingPath) {
                        lastPathNodeId?.let { prevId ->
                            val edgeId = "$edgeCounter"
                            edgeCounter++

                            val accessible = !isStaircase
                            val edgeType = if (isStaircase) "stair" else "walkway"

                            val edge = Edge(
                                edgeId = edgeId,
                                fromNodeId = prevId,
                                toNodeId = nodeId,
                                bidirectional = true,
                                edgeType = edgeType,
                                accessible = accessible
                            )
                            edges.add(edge)
                        }
                        lastPathNodeId = nodeId
                    }

                    // Persist whole graph (nodes + edges) to JSON
                    saveGraphToFile()
                } else {
                    locationTextView.text = "Unable to get location."
                }

                object : CountDownTimer(5000, 1000) {
                    override fun onTick(millisUntilFinished: Long) {
                        button.text = "Wait ${millisUntilFinished / 1000}s"
                    }
                    override fun onFinish() {
                        button.text = "Save Current Location"
                        button.isEnabled = true
                        button.alpha = 1.0f
                    }
                }.start()
            }
    }

    // Show a single pin at the selected node
    private fun updateMapPin(node: Node) {
        val latLng = LatLng(node.latitude, node.longitude)
        googleMap?.clear()
        googleMap?.addMarker(MarkerOptions().position(latLng).title(node.nodeId))
        googleMap?.moveCamera(CameraUpdateFactory.newLatLngZoom(latLng, 17f))
    }

    private fun redrawGraphOnMap(selected: Node? = null) {
        val map = googleMap ?: return

        map.clear()

        // 1) Draw edges as polylines
        edges.forEach { edge ->
            val from = nodes.find { it.nodeId == edge.fromNodeId }
            val to = nodes.find { it.nodeId == edge.toNodeId }
            if (from != null && to != null) {
                val polylineOptions = PolylineOptions()
                    .add(LatLng(from.latitude, from.longitude))
                    .add(LatLng(to.latitude, to.longitude))
                    .color(if (edge.accessible) Color.GREEN else Color.RED)
                    .width(6f)

                map.addPolyline(polylineOptions)
            }
        }

        // 2) Draw markers for all nodes
        nodes.forEach { n ->
            val isSelected = selected?.nodeId == n.nodeId

            val markerOptions = MarkerOptions()
                .position(LatLng(n.latitude, n.longitude))
                .title(n.nodeId)

            if (isSelected) {
                // highlighted pin (e.g., yellow)
                markerOptions.icon(
                    BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_YELLOW)
                )
            } else {
                // normal pin (e.g., red)
                markerOptions.icon(
                    BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_RED)
                )
            }

            map.addMarker(markerOptions)
        }

        // 3) Center/zoom on selected node if provided
        selected?.let {
            val latLng = LatLng(it.latitude, it.longitude)
            map.moveCamera(CameraUpdateFactory.newLatLngZoom(latLng, 17f))
        }
    }

    // Manual connection: pendingFromNodeId -> currently selected node
    private fun connectPendingToSelected() {
        if (pendingFromNodeId == null) {
            Toast.makeText(this, "Tap a node in the list to choose a start node first.", Toast.LENGTH_SHORT).show()
            return
        }
        if (selectedNodeIndex < 0 || selectedNodeIndex >= nodes.size) {
            Toast.makeText(this, "No selected node to connect to.", Toast.LENGTH_SHORT).show()
            return
        }

        val fromId = pendingFromNodeId!!
        val toNode = nodes[selectedNodeIndex]

        if (fromId == toNode.nodeId) {
            Toast.makeText(this, "Cannot connect node to itself.", Toast.LENGTH_SHORT).show()
            return
        }

        val accessible = !toNode.staircase
        val edgeType = when {
            toNode.staircase -> "stair"
            toNode.elevator  -> "elevator"
            else             -> "corridor"
        }

        val edgeId = "edge_$edgeCounter"
        edgeCounter++

        val edge = Edge(
            edgeId = edgeId,
            fromNodeId = fromId,
            toNodeId = toNode.nodeId,
            bidirectional = true,
            edgeType = edgeType,
            accessible = accessible
        )
        edges.add(edge)

        Toast.makeText(this, "Connected $fromId → ${toNode.nodeId}", Toast.LENGTH_SHORT).show()

        // Persist updated graph
        saveGraphToFile()
        pendingFromNodeId = null
        connectMode = false
        redrawGraphOnMap(selected = toNode)
    }

    // Serialize nodes + edges into a normalized JSON graph
    private fun saveGraphToFile() {
        jsonFileUri?.let { uri ->
            try {
                val nodesArray = JSONArray().apply {
                    nodes.forEach { n ->
                        put(
                            JSONObject().apply {
                                put("nodeId", n.nodeId)
                                put("lat", n.latitude)
                                put("lon", n.longitude)
                                put("elevationM", n.elevationM)
                                put("location", n.location)
                                put("floorCode", n.floorCode)
                                put("entrance", n.entrance)
                                put("elevator", n.elevator)
                                put("staircase", n.staircase)
                            }
                        )
                    }
                }

                val edgesArray = JSONArray().apply {
                    edges.forEach { e ->
                        put(
                            JSONObject().apply {
                                put("edgeId", e.edgeId)
                                put("fromNodeId", e.fromNodeId)
                                put("toNodeId", e.toNodeId)
                                put("bidirectional", e.bidirectional)
                                put("edgeType", e.edgeType)
                                put("accessible", e.accessible)
                            }
                        )
                    }
                }

                gpsRootObject = JSONObject().apply {
                    put("nodes", nodesArray)
                    put("edges", edgesArray)
                }

                val jsonString = gpsRootObject.toString(4)
                contentResolver.openOutputStream(uri, "wt")?.use { outputStream ->
                    outputStream.write(jsonString.toByteArray())
                }
                Toast.makeText(this, "Graph saved to JSON file", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                Toast.makeText(this, "Failed to save graph: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        } ?: run {
            Toast.makeText(this, "Please select a file location first", Toast.LENGTH_SHORT).show()
        }
    }

    // Load existing nodes + edges from selected file into memory
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == CREATE_FILE_REQUEST_CODE && resultCode == RESULT_OK) {
            data?.data?.also { uri ->
                jsonFileUri = uri
                val input = contentResolver.openInputStream(uri)
                val text = input?.bufferedReader()?.readText()

                nodes.clear()
                edges.clear()

                if (!text.isNullOrBlank()) {
                    gpsRootObject = JSONObject(text)

                    val nodesArray = gpsRootObject.optJSONArray("nodes") ?: JSONArray()
                    for (i in 0 until nodesArray.length()) {
                        val obj = nodesArray.getJSONObject(i)
                        nodes.add(
                            Node(
                                nodeId = obj.optString("nodeId"),
                                latitude = obj.optDouble("lat"),
                                longitude = obj.optDouble("lon"),
                                elevationM = if (obj.has("elevationM")) obj.optDouble("elevationM") else null,
                                location = obj.optString("location", "outside"),
                                floorCode = obj.optString("floorCode", "outside"),
                                entrance = obj.optBoolean("entrance", false),
                                elevator = obj.optBoolean("elevator", false),
                                staircase = obj.optBoolean("staircase", false)
                            )
                        )
                    }

                    val edgesArray = gpsRootObject.optJSONArray("edges") ?: JSONArray()
                    for (i in 0 until edgesArray.length()) {
                        val obj = edgesArray.getJSONObject(i)
                        edges.add(
                            Edge(
                                edgeId = obj.optString("edgeId"),
                                fromNodeId = obj.optString("fromNodeId"),
                                toNodeId = obj.optString("toNodeId"),
                                bidirectional = obj.optBoolean("bidirectional", true),
                                edgeType = obj.optString("edgeType", "walkway"),
                                accessible = obj.optBoolean("accessible", true)
                            )
                        )
                    }

                    nodeCounter = nodes.size + 1
                    edgeCounter = edges.size + 1
                    selectedNodeIndex = if (nodes.isNotEmpty()) nodes.size - 1 else -1
                    redrawGraphOnMap(selected = nodes[selectedNodeIndex])
                    nodeAdapter.updateNodes(nodes, selectedNodeIndex)
                    if (selectedNodeIndex >= 0) redrawGraphOnMap(nodes[selectedNodeIndex])
                } else {
                    AppSettings.load(this)
                    val initialNodeValue = AppSettings.initialNodeNumber
                    val initialEdgeValue = AppSettings.initialEdgeNumber
                    gpsRootObject = JSONObject()
                    nodeCounter = initialNodeValue
                    edgeCounter = initialEdgeValue
                    selectedNodeIndex = -1
                    nodeAdapter.updateNodes(nodes, selectedNodeIndex)
                    redrawGraphOnMap(null)
                }

                Toast.makeText(this, "Selected file for saving: $uri", Toast.LENGTH_LONG).show()
            }
        }
    }
    private fun deleteSelectedNode() {
        if (selectedNodeIndex < 0 || selectedNodeIndex >= nodes.size) {
            Toast.makeText(this, "No node selected to delete.", Toast.LENGTH_SHORT).show()
            return
        }

        val nodeToDelete = nodes[selectedNodeIndex]

        // Remove any edges involving this node
        val iterator = edges.iterator()
        while (iterator.hasNext()) {
            val e = iterator.next()
            if (e.fromNodeId == nodeToDelete.nodeId || e.toNodeId == nodeToDelete.nodeId) {
                iterator.remove()
            }
        }

        // Remove node from list
        nodes.removeAt(selectedNodeIndex)

        // Adjust selection index
        selectedNodeIndex = when {
            nodes.isEmpty() -> -1
            selectedNodeIndex >= nodes.size -> nodes.size - 1
            else -> selectedNodeIndex
        }
        redrawGraphOnMap(selected = nodes[selectedNodeIndex])


        nodeAdapter.updateNodes(nodes, selectedNodeIndex)

        if (selectedNodeIndex >= 0) {
            redrawGraphOnMap(nodes[selectedNodeIndex])
        } else {
            googleMap?.clear()
        }

        // Persist updated graph
        saveGraphToFile()

        Toast.makeText(this, "Node deleted.", Toast.LENGTH_SHORT).show()
    }

}

// RecyclerView Adapter for nodes (updated for nodeId/floorCode)
class NodeAdapter(
    private var nodes: List<Node>,
    private var selectedIndex: Int = -1,
    private val onNodeSelected: (Node, Int) -> Unit
) : RecyclerView.Adapter<NodeAdapter.NodeViewHolder>() {

    inner class NodeViewHolder(val view: View) : RecyclerView.ViewHolder(view) {
        val textView: TextView = view.findViewById(R.id.node_text)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): NodeViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.node_item, parent, false)
        return NodeViewHolder(view)
    }

    override fun onBindViewHolder(holder: NodeViewHolder, position: Int) {
        val node = nodes[position]
        holder.textView.text =
            "${node.nodeId} (${node.latitude}, ${node.longitude})\nFloor: ${node.floorCode}"
        holder.textView.setBackgroundColor(
            if (position == selectedIndex) Color.LTGRAY else Color.TRANSPARENT
        )
        holder.view.setOnClickListener {
            val prevIndex = selectedIndex
            selectedIndex = position
            if (prevIndex >= 0) notifyItemChanged(prevIndex)
            notifyItemChanged(selectedIndex)
            onNodeSelected(node, position)
        }
    }

    override fun getItemCount() = nodes.size

    fun updateNodes(newNodes: List<Node>, newSelectedIndex: Int) {
        nodes = newNodes
        selectedIndex = newSelectedIndex
        notifyDataSetChanged()
    }

}
